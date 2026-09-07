// SPDX-License-Identifier: GPL-2.0-or-later
#include "searchindex.h"

#include <QJSEngine>
#include <QLocale>
#include <QtQml/qqml.h>
#include <algorithm>

namespace {
QString stringProperty(const QJSValue &value, const QString &key)
{
    const auto property = value.property(key);
    return property.isNull() || property.isUndefined() ? QString() : property.toString();
}
}

SearchIndex::SearchIndex(QObject *parent) : QObject(parent) {}
QJSValue SearchIndex::applications() const { return m_applications; }
int SearchIndex::count() const { return m_results.size(); }

QString SearchIndex::normalize(const QString &text)
{
    auto result = QLocale().toLower(text).normalized(QString::NormalizationForm_D);
    result.removeIf([](QChar character) {
        return character.unicode() >= 0x0300 && character.unicode() <= 0x036f;
    });
    return result;
}

void SearchIndex::setApplications(const QJSValue &applications)
{
    if (m_applications.strictlyEquals(applications)) {
        return;
    }
    m_applications = applications;
    m_entries.clear();
    m_byId.clear();
    const int length = applications.isArray() ? applications.property(QStringLiteral("length")).toInt() : 0;
    m_entries.reserve(length);
    m_byId.reserve(length);
    for (int row = 0; row < length; ++row) {
        const auto app = applications.property(row);
        const auto id = stringProperty(app, QStringLiteral("id"));
        if (id.isEmpty() || m_byId.contains(id)) {
            continue;
        }
        m_byId.insert(id, m_entries.size());
        m_entries.push_back({app, QJSValue(),
            normalize(stringProperty(app, QStringLiteral("title"))),
            normalize(stringProperty(app, QStringLiteral("description"))), normalize(id)});
    }
    // The controller publishes a complete local/provider snapshot after search().
    m_dirty = true;
    Q_EMIT applicationsChanged();
}

int SearchIndex::score(const Entry &entry, const QStringList &tokens, bool descriptions)
{
    int result = 0;
    for (const auto &token : tokens) {
        if (entry.title == token) {
            continue;
        }
        if (entry.title.startsWith(token)) {
            result += 10;
        } else if (entry.title.contains(QLatin1Char(' ') + token)) {
            result += 20;
        } else if (entry.title.contains(token)) {
            result += 30;
        } else if (descriptions && entry.description.contains(token)) {
            result += 60;
        } else if (entry.id.contains(token)) {
            result += 80;
        } else {
            return -1;
        }
    }
    return result * 1000 + std::min<qsizetype>(entry.title.size(), 100);
}

bool SearchIndex::search(const QString &query, bool includeDescriptions)
{
    const auto normalized = normalize(query).simplified();
    if (!m_dirty && normalized == m_query && includeDescriptions == m_descriptions) {
        return false;
    }
    m_query = normalized;
    m_descriptions = includeDescriptions;
    m_scratch.clear();
    m_scratch.reserve(m_entries.size());
    if (!normalized.isEmpty()) {
        const auto tokens = normalized.split(QLatin1Char(' '), Qt::SkipEmptyParts);
        for (int index = 0; index < m_entries.size(); ++index) {
            const int rank = score(m_entries[index], tokens, includeDescriptions);
            if (rank >= 0) {
                m_scratch.push_back({index, rank});
            }
        }
        std::sort(m_scratch.begin(), m_scratch.end(), [](const Match &left, const Match &right) {
            return left.score == right.score ? left.index < right.index : left.score < right.score;
        });
    }
    bool changed = m_dirty || m_results.size() != m_scratch.size();
    if (!changed) {
        for (int row = 0; row < m_results.size(); ++row) {
            if (m_results[row] != m_scratch[row].index) {
                changed = true;
                break;
            }
        }
    }
    m_dirty = false;
    if (!changed) {
        return false;
    }
    m_results.resize(m_scratch.size());
    m_matched.fill(false, m_entries.size());
    for (int row = 0; row < m_scratch.size(); ++row) {
        m_results[row] = m_scratch[row].index;
        m_matched.setBit(m_results[row]);
    }
    Q_EMIT resultsChanged();
    return true;
}

QJSValue SearchIndex::materialize(int index)
{
    if (index < 0 || index >= m_entries.size()) {
        return QJSValue(QJSValue::NullValue);
    }
    auto &entry = m_entries[index];
    if (entry.cached.isUndefined()) {
        auto *engine = qjsEngine(this);
        if (!engine) {
            return QJSValue(QJSValue::NullValue);
        }
        auto object = engine->newObject();
        object.setProperty(QStringLiteral("type"), QStringLiteral("app"));
        for (const auto *key : {"id", "title", "description", "url"}) {
            object.setProperty(QString::fromLatin1(key), stringProperty(entry.source, QString::fromLatin1(key)));
        }
        const auto icon = entry.source.property(QStringLiteral("icon"));
        object.setProperty(QStringLiteral("icon"), icon.isNull() || icon.isUndefined()
            ? QJSValue(QStringLiteral("application-x-executable")) : icon);
        const auto sourceRow = entry.source.property(QStringLiteral("sourceRow"));
        object.setProperty(QStringLiteral("sourceRow"), sourceRow.isNull() || sourceRow.isUndefined()
            ? -1 : sourceRow.toInt());
        object.setProperty(QStringLiteral("apps"), engine->newArray());
        object.setProperty(QStringLiteral("previewIcons"), engine->newArray());
        entry.cached = object;
    }
    return entry.cached;
}

QJSValue SearchIndex::entryAt(int index)
{
    return materialize(index >= 0 && index < m_results.size() ? m_results[index] : -1);
}

QJSValue SearchIndex::application(const QString &id)
{
    return materialize(m_byId.value(id, -1));
}

bool SearchIndex::contains(const QString &id) const
{
    const int index = m_byId.value(id, -1);
    return index >= 0 && index < m_matched.size() && m_matched.testBit(index);
}
