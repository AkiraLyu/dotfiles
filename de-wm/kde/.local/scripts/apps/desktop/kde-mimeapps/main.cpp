#include <KApplicationTrader>
#include <KConfig>
#include <KConfigGroup>
#include <KService>
#include <KSycoca>

#include <QBuffer>
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QMap>
#include <QMimeDatabase>
#include <QSaveFile>
#include <QSet>
#include <QStandardPaths>
#include <QTextStream>

#include <memory>
#include <stdexcept>

using Associations = QMap<QString, QStringList>;

static QString canonicalType(const QString &name)
{
    if (name.startsWith(QLatin1String("x-scheme-handler/"))) {
        return name;
    }
    return QMimeDatabase().mimeTypeForName(name).name();
}

static QSet<QString> associationTypes()
{
    QSet<QString> types;
    for (const auto &mime : QMimeDatabase().allMimeTypes()) {
        types.insert(mime.name());
    }

    // URL 协议不属于普通 MIME 数据库，应用声明和用户设置都需要检查。
    for (const auto &service : KService::allServices()) {
        for (const auto &scheme : service->schemeHandlers()) {
            types.insert(QStringLiteral("x-scheme-handler/") + scheme);
        }
    }
    const auto directories = QStandardPaths::standardLocations(QStandardPaths::GenericConfigLocation)
        + QStandardPaths::standardLocations(QStandardPaths::ApplicationsLocation);
    for (const auto &directory : directories) {
        for (const auto &filename : {QStringLiteral("kde-mimeapps.list"), QStringLiteral("mimeapps.list")}) {
            const QString path = directory + QLatin1Char('/') + filename;
            if (!QFileInfo::exists(path)) {
                continue;
            }
            KConfig config(path, KConfig::SimpleConfig);
            for (const auto &group : {"Default Applications", "Added Associations", "Removed Associations"}) {
                for (const auto &key : KConfigGroup(&config, group).keyList()) {
                    const QString type = canonicalType(key);
                    if (!type.isEmpty()) {
                        types.insert(type);
                    }
                }
            }
        }
    }
    return types;
}

static Associations kdeAssociations()
{
    KSycoca::self()->ensureCacheValid();
    if (!KSycoca::isAvailable()) {
        throw std::runtime_error("KDE 应用关联缓存不可用，请检查 kservice 和 kbuildsycoca6。");
    }

    Associations associations;
    for (const auto &type : associationTypes()) {
        QStringList applications;
        // KDE 已处理用户覆盖、别名、继承、移除项和无效应用；第一项就是默认应用。
        for (const auto &service : KApplicationTrader::queryByMimeType(type)) {
            const QString id = service->storageId();
            if (!applications.contains(id)) {
                applications.append(id);
            }
        }
        if (!applications.isEmpty()) {
            associations.insert(type, applications);
        }
    }
    if (associations.isEmpty()) {
        throw std::runtime_error("KDE 没有可导出的文件关联，未写入文件。");
    }
    return associations;
}

static QByteArray renderAssociations(const Associations &associations, const QString &userConfig)
{
    auto buffer = std::make_shared<QBuffer>();
    buffer->open(QIODevice::ReadWrite);
    KConfig output(buffer, KConfig::SimpleConfig);
    KConfig input(userConfig, KConfig::SimpleConfig);
    for (const auto &group : input.groupList()) {
        if (group != QLatin1String("Default Applications")) {
            KConfigGroup destination(&output, group);
            KConfigGroup(&input, group).copyTo(&destination);
        }
    }

    KConfigGroup defaults(&output, "Default Applications");
    KConfigGroup added(&output, "Added Associations");
    KConfigGroup removed(&output, "Removed Associations");
    for (const auto &key : added.keyList()) {
        if (associations.contains(canonicalType(key))) {
            added.deleteEntry(key);
        }
    }
    for (const auto &key : removed.keyList()) {
        auto applications = removed.readXdgListEntry(key);
        for (const auto &id : associations.value(canonicalType(key))) {
            applications.removeAll(id);
        }
        if (applications.isEmpty()) {
            removed.deleteEntry(key);
        } else {
            removed.writeXdgListEntry(key, applications);
        }
    }
    for (auto it = associations.cbegin(); it != associations.cend(); ++it) {
        defaults.writeXdgListEntry(it.key(), it.value());
        // 将 KDE 的有效候选同时声明为关联，供其他桌面和 GLib 正确读取。
        added.writeXdgListEntry(it.key(), it.value());
    }
    if (!output.sync()) {
        throw std::runtime_error("无法生成 MIME 关联内容。");
    }
    return "# Generated from KDE by dotfiles-kde-mimeapps.\n\n" + buffer->data();
}

static bool writeAssociations(QString path, const QByteArray &content)
{
    // 保留 Stow 等工具建立的文件链接，只更新链接指向的配置。
    if (QFileInfo(path).isSymLink()) {
        path = QFileInfo(path).canonicalFilePath();
        if (path.isEmpty()) {
            throw std::runtime_error("输出路径是无效的符号链接。");
        }
    }
    QFile existing(path);
    if (existing.exists()) {
        if (!existing.open(QIODevice::ReadOnly)) {
            throw std::runtime_error(existing.errorString().toStdString());
        }
        const auto previous = existing.readAll();
        if (existing.error() != QFileDevice::NoError) {
            throw std::runtime_error(existing.errorString().toStdString());
        }
        if (previous == content) {
            return false;
        }
    }
    if (!QDir().mkpath(QFileInfo(path).absolutePath())) {
        throw std::runtime_error("无法创建输出目录。");
    }
    QSaveFile output(path);
    if (!output.open(QIODevice::WriteOnly) || output.write(content) != content.size() || !output.commit()) {
        throw std::runtime_error(output.errorString().toStdString());
    }
    return true;
}

int main(int argc, char **argv)
{
    // 仅改变当前进程；在 niri 中运行时也读取 KDE 的实际设置。
    qputenv("XDG_CURRENT_DESKTOP", "KDE");
    qputenv("XDG_MENU_PREFIX", "plasma-");
    QCoreApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("dotfiles-kde-mimeapps"));
    const QString userConfig = QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation)
        + QStringLiteral("/mimeapps.list");

    QCommandLineParser parser;
    parser.setApplicationDescription(QStringLiteral("从 KDE 实际生效的文件关联生成 mimeapps.list。"));
    parser.addHelpOption();
    parser.addOption({{"o", "output"}, QStringLiteral("输出文件，默认更新用户的 mimeapps.list。"), "path", userConfig});
    parser.addOption({"dry-run", QStringLiteral("将生成内容输出到标准输出，不修改关联文件。")});
    parser.process(app);
    if (!parser.positionalArguments().isEmpty()) {
        QTextStream(stderr) << "不接受位置参数，请使用 --output 指定输出文件。\n";
        return 1;
    }

    try {
        const auto associations = kdeAssociations();
        const auto content = renderAssociations(associations, userConfig);
        if (parser.isSet("dry-run")) {
            QFile output;
            if (!output.open(stdout, QIODevice::WriteOnly)
                || output.write(content) != content.size() || !output.flush()) {
                throw std::runtime_error("无法写入标准输出。");
            }
        } else {
            const QString path = parser.value("output");
            if (path.isEmpty()) {
                throw std::runtime_error("输出路径不能为空。");
            }
            const bool changed = writeAssociations(path, content);
            QTextStream(stderr) << (changed ? "已更新：" : "内容未变化：")
                << path << "（" << associations.size() << " 条关联）。\n";
        }
    } catch (const std::exception &error) {
        QTextStream(stderr) << "错误：" << error.what() << '\n';
        return 1;
    }
    return 0;
}
