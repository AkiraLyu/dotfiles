pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts

import org.kde.kcmutils as KCM
import org.kde.kirigami as Kirigami
import org.kde.plasma.private.kicker as Kicker

import "FavoriteUtils.js" as FavoriteUtils

KCM.SimpleKCM {
    id: page

    property var cfg_applications: []
    property var cfg_applicationsDefault: []
    property alias cfg_folderName: folderName.text
    property string cfg_folderNameDefault: "桌面文件夹"
    property alias cfg_columns: columns.value
    property int cfg_columnsDefault: 4
    property alias cfg_showLabels: showLabels.checked
    property bool cfg_showLabelsDefault: true
    property alias cfg_closeAfterLaunch: closeAfterLaunch.checked
    property bool cfg_closeAfterLaunchDefault: true
    readonly property var searchResults: searchBackend.count > 0
        ? searchBackend.modelForRow(0)
        : null
    property bool syncingSelection: false

    function arraysEqual(left, right) {
        return FavoriteUtils.arraysEqual(left, right);
    }

    function normalizeFavorite(rawValue) {
        return FavoriteUtils.normalizeFavorite(rawValue);
    }

    function canonicalFavorites(values) {
        return FavoriteUtils.canonicalFavorites(values);
    }

    function loadSelection() {
        if (syncingSelection) {
            return;
        }

        syncingSelection = true;
        selectedApps.favorites = canonicalFavorites(cfg_applications);
        const actualFavorites = canonicalFavorites(selectedApps.favorites);
        if (!arraysEqual(actualFavorites, cfg_applications)) {
            cfg_applications = actualFavorites;
        }
        syncingSelection = false;
    }

    function syncConfiguration() {
        if (syncingSelection) {
            return;
        }

        const favorites = canonicalFavorites(selectedApps.favorites);
        if (arraysEqual(favorites, cfg_applications)) {
            return;
        }

        syncingSelection = true;
        cfg_applications = favorites;
        syncingSelection = false;
    }

    onCfg_applicationsChanged: loadSelection()
    Component.onCompleted: loadSelection()

    Kicker.SimpleFavoritesModel {
        id: selectedApps

        onFavoritesChanged: page.syncConfiguration()
    }

    Kicker.RunnerModel {
        id: searchBackend

        runners: ["krunner_services"]
        mergeResults: true
        favoritesModel: selectedApps
        query: searchField.text.trim()
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Kirigami.Units.largeSpacing

        Kirigami.FormLayout {
            Layout.fillWidth: true

            QQC2.TextField {
                id: folderName

                Kirigami.FormData.label: "文件夹名称："
                Layout.fillWidth: true
                placeholderText: "桌面文件夹"
            }

            QQC2.SpinBox {
                id: columns

                Kirigami.FormData.label: "每行应用数："
                from: 3
                to: 4
            }

            QQC2.CheckBox {
                id: showLabels

                Kirigami.FormData.label: "显示："
                text: "在展开视图中显示项目名称"
            }

            QQC2.CheckBox {
                id: closeAfterLaunch

                text: "打开项目后自动关闭文件夹"
            }
        }

        Kirigami.Separator {
            Layout.fillWidth: true
        }

        Kirigami.Heading {
            Layout.fillWidth: true
            level: 3
            text: "添加应用"
        }

        Kirigami.SearchField {
            id: searchField

            Layout.fillWidth: true
            placeholderText: "输入应用名称进行搜索…"
        }

        QQC2.Frame {
            Layout.fillWidth: true
            Layout.preferredHeight: Kirigami.Units.gridUnit * 9
            padding: 0

            ListView {
                id: resultsList

                anchors.fill: parent
                clip: true
                model: page.searchResults
                boundsBehavior: Flickable.StopAtBounds

                delegate: Item {
                    id: resultDelegate

                    required property string display
                    required property string description
                    required property var decoration
                    required property string favoriteId

                    readonly property string canonicalFavoriteId: page.normalizeFavorite(favoriteId)
                    width: resultsList.width
                    height: resultButton.implicitHeight

                    QQC2.ItemDelegate {
                        id: resultButton

                        anchors.fill: parent
                        enabled: resultDelegate.canonicalFavoriteId.length > 0
                            && !Array.from(selectedApps.favorites)
                                .includes(resultDelegate.canonicalFavoriteId)
                        Accessible.name: enabled
                            ? "添加 %1".arg(resultDelegate.display)
                            : "%1 已在文件夹中".arg(resultDelegate.display)

                        contentItem: RowLayout {
                            spacing: Kirigami.Units.smallSpacing

                            Kirigami.Icon {
                                Layout.preferredWidth: Kirigami.Units.iconSizes.medium
                                Layout.preferredHeight: width
                                source: resultDelegate.decoration
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 0

                                QQC2.Label {
                                    Layout.fillWidth: true
                                    text: resultDelegate.display
                                    textFormat: Text.PlainText
                                    elide: Text.ElideRight
                                }

                                QQC2.Label {
                                    Layout.fillWidth: true
                                    visible: text.length > 0
                                    text: resultDelegate.description
                                    textFormat: Text.PlainText
                                    elide: Text.ElideRight
                                    opacity: 0.68
                                    font.pointSize: Kirigami.Theme.smallFont.pointSize
                                }
                            }

                            Kirigami.Icon {
                                Layout.preferredWidth: Kirigami.Units.iconSizes.smallMedium
                                Layout.preferredHeight: width
                                source: resultButton.enabled ? "list-add" : "checkmark"
                            }
                        }

                        onClicked: {
                            if (resultDelegate.canonicalFavoriteId.length > 0
                                    && !selectedApps.isFavorite(resultDelegate.canonicalFavoriteId)) {
                                selectedApps.addFavorite(resultDelegate.canonicalFavoriteId);
                            }
                        }
                    }
                }

                QQC2.Label {
                    anchors.centerIn: parent
                    width: parent.width - Kirigami.Units.largeSpacing * 2
                    visible: searchField.text.trim().length === 0
                    text: "输入名称后，搜索结果会显示在这里"
                    horizontalAlignment: Text.AlignHCenter
                    opacity: 0.65
                }

                QQC2.Label {
                    anchors.centerIn: parent
                    width: parent.width - Kirigami.Units.largeSpacing * 2
                    visible: searchField.text.trim().length > 0
                        && !searchBackend.querying
                        && (!page.searchResults || page.searchResults.count === 0)
                    text: "没有找到应用"
                    horizontalAlignment: Text.AlignHCenter
                    opacity: 0.65
                }

                QQC2.BusyIndicator {
                    anchors.centerIn: parent
                    running: searchBackend.querying
                    visible: running && resultsList.count === 0
                }

                QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
            }
        }

        RowLayout {
            Layout.fillWidth: true

            Kirigami.Heading {
                Layout.fillWidth: true
                level: 3
                text: "文件夹中的项目"
            }

            QQC2.Label {
                text: "%1 个".arg(selectedApps.count)
                opacity: 0.68
            }
        }

        QQC2.Frame {
            Layout.fillWidth: true
            Layout.fillHeight: true
            padding: 0

            ListView {
                id: selectedList

                anchors.fill: parent
                clip: true
                model: selectedApps
                boundsBehavior: Flickable.StopAtBounds

                delegate: Item {
                    id: selectedDelegate

                    required property int index
                    required property string display
                    required property var decoration
                    required property string favoriteId

                    width: selectedList.width
                    height: selectedButton.implicitHeight

                    QQC2.ItemDelegate {
                        id: selectedButton

                        anchors.fill: parent

                        contentItem: RowLayout {
                            spacing: Kirigami.Units.smallSpacing

                            Kirigami.Icon {
                                Layout.preferredWidth: Kirigami.Units.iconSizes.medium
                                Layout.preferredHeight: width
                                source: selectedDelegate.decoration
                            }

                            QQC2.Label {
                                Layout.fillWidth: true
                                text: selectedDelegate.display
                                textFormat: Text.PlainText
                                elide: Text.ElideRight
                            }

                            QQC2.ToolButton {
                                id: moveUpButton

                                enabled: selectedDelegate.index > 0
                                icon.name: "go-up"
                                text: "上移"
                                display: QQC2.AbstractButton.IconOnly
                                onClicked: selectedApps.moveRow(
                                    selectedDelegate.index,
                                    selectedDelegate.index - 1)

                                QQC2.ToolTip {
                                    text: moveUpButton.text
                                }
                            }

                            QQC2.ToolButton {
                                id: moveDownButton

                                enabled: selectedDelegate.index < selectedApps.count - 1
                                icon.name: "go-down"
                                text: "下移"
                                display: QQC2.AbstractButton.IconOnly
                                onClicked: selectedApps.moveRow(
                                    selectedDelegate.index,
                                    selectedDelegate.index + 1)

                                QQC2.ToolTip {
                                    text: moveDownButton.text
                                }
                            }

                            QQC2.ToolButton {
                                id: removeButton

                                icon.name: "list-remove"
                                text: "移除"
                                display: QQC2.AbstractButton.IconOnly
                                onClicked: selectedApps.removeFavorite(selectedDelegate.favoriteId)

                                QQC2.ToolTip {
                                    text: removeButton.text
                                }
                            }
                        }
                    }
                }

                QQC2.Label {
                    anchors.centerIn: parent
                    width: parent.width - Kirigami.Units.largeSpacing * 2
                    visible: selectedApps.count === 0
                    text: "还没有项目；可在上方搜索添加应用，也可把应用或文件直接拖到桌面文件夹中。"
                    wrapMode: Text.Wrap
                    horizontalAlignment: Text.AlignHCenter
                    opacity: 0.65
                }

                QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
            }
        }
    }
}
