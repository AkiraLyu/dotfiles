// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <QBitArray>
#include <QHash>
#include <QJSValue>
#include <QObject>
#include <QStringList>
#include <QVector>

// Keep ranking and result storage out of the QML heap. Only entries requested
// by visible slots become JS objects; those objects survive query refinement.
class SearchIndex : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QJSValue applications READ applications WRITE setApplications NOTIFY applicationsChanged)
    Q_PROPERTY(int count READ count NOTIFY resultsChanged)

public:
    explicit SearchIndex(QObject *parent = nullptr);
    QJSValue applications() const;
    void setApplications(const QJSValue &applications);
    int count() const;
    Q_INVOKABLE bool search(const QString &query, bool includeDescriptions = true);
    Q_INVOKABLE QJSValue entryAt(int index);
    Q_INVOKABLE QJSValue application(const QString &id);
    Q_INVOKABLE bool contains(const QString &id) const;

Q_SIGNALS:
    void applicationsChanged();
    void resultsChanged();

private:
    struct Entry {
        QJSValue source;
        QJSValue cached;
        QString title;
        QString description;
        QString id;
    };
    struct Match {
        int index;
        int score;
    };
    QJSValue materialize(int index);
    static QString normalize(const QString &text);
    static int score(const Entry &entry, const QStringList &tokens, bool descriptions);

    QJSValue m_applications;
    QVector<Entry> m_entries;
    QHash<QString, int> m_byId;
    QVector<int> m_results;
    QVector<Match> m_scratch;
    QBitArray m_matched;
    QString m_query;
    bool m_descriptions = true;
    bool m_dirty = true;
};
