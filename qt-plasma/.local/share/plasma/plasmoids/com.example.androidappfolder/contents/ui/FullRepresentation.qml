pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts

import org.kde.draganddrop as DragAndDrop
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents3

FocusScope {
    id: full

    required property var folderRoot
    property bool dropActive: false
    readonly property int columns: Math.min(
        4,
        Math.max(3, folderRoot.gridColumns))
    readonly property int maximumVisibleRows: 4
    readonly property int totalRows: Math.max(
        1,
        Math.ceil(folderRoot.applicationsModel.count / columns))
    readonly property int visibleRows: Math.min(maximumVisibleRows, totalRows)
    readonly property bool needsScrolling: totalRows > maximumVisibleRows
    readonly property real delegateHeight: folderRoot.showLabels
        ? Kirigami.Units.gridUnit * 6
        : Kirigami.Units.gridUnit * 4.5
    readonly property color accentColor: Kirigami.Theme.highlightColor
    readonly property color backgroundColor: Kirigami.Theme.backgroundColor

    implicitWidth: Math.max(Kirigami.Units.gridUnit * 18, columns * Kirigami.Units.gridUnit * 5)
    implicitHeight: Math.max(
        Kirigami.Units.gridUnit * 15,
        visibleRows * delegateHeight + Kirigami.Units.gridUnit * 7)
    Layout.minimumWidth: Kirigami.Units.gridUnit * 15
    Layout.minimumHeight: Kirigami.Units.gridUnit * 14

    Keys.onEscapePressed: folderRoot.closeFolder()

    Rectangle {
        anchors.fill: parent
        radius: Kirigami.Units.gridUnit * 1.4
        border.width: 1
        border.color: Qt.rgba(
            full.accentColor.r,
            full.accentColor.g,
            full.accentColor.b,
            0.46)
        gradient: Gradient {
            GradientStop {
                position: 0
                color: Qt.rgba(
                    full.backgroundColor.r * 0.82 + full.accentColor.r * 0.18,
                    full.backgroundColor.g * 0.82 + full.accentColor.g * 0.18,
                    full.backgroundColor.b * 0.82 + full.accentColor.b * 0.18,
                    0.88)
            }
            GradientStop {
                position: 1
                color: Qt.rgba(
                    full.backgroundColor.r,
                    full.backgroundColor.g,
                    full.backgroundColor.b,
                    0.76)
            }
        }
    }

    ColumnLayout {
        anchors {
            fill: parent
            margins: Kirigami.Units.gridUnit
        }
        spacing: Kirigami.Units.largeSpacing

        RowLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.largeSpacing

            Rectangle {
                Layout.preferredWidth: Kirigami.Units.gridUnit * 2.7
                Layout.preferredHeight: width
                radius: Kirigami.Units.gridUnit * 0.85
                color: Qt.rgba(
                    full.accentColor.r,
                    full.accentColor.g,
                    full.accentColor.b,
                    0.24)
                border.width: 1
                border.color: Qt.rgba(
                    full.accentColor.r,
                    full.accentColor.g,
                    full.accentColor.b,
                    0.58)

                Kirigami.Icon {
                    anchors.centerIn: parent
                    width: parent.width * 0.58
                    height: width
                    source: "folder-applications"
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0

                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: full.folderRoot.folderName
                    textFormat: Text.PlainText
                    elide: Text.ElideRight
                    font.bold: true
                    font.pointSize: Kirigami.Theme.defaultFont.pointSize * 1.22
                }

                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: "%1 个项目".arg(full.folderRoot.applicationsModel.count)
                    textFormat: Text.PlainText
                    opacity: 0.62
                    font.pointSize: Kirigami.Theme.smallFont.pointSize
                }
            }

            PlasmaComponents3.ToolButton {
                id: addButton

                enabled: !full.folderRoot.isImmutable
                icon.name: "list-add"
                text: "添加项目"
                display: PlasmaComponents3.AbstractButton.IconOnly
                Accessible.name: text
                onClicked: full.folderRoot.openConfiguration()

                PlasmaComponents3.ToolTip {
                    text: addButton.text
                }
            }

            PlasmaComponents3.ToolButton {
                id: settingsButton

                icon.name: "configure"
                text: "设置"
                display: PlasmaComponents3.AbstractButton.IconOnly
                Accessible.name: text
                onClicked: full.folderRoot.openConfiguration()

                PlasmaComponents3.ToolTip {
                    text: settingsButton.text
                }
            }

            PlasmaComponents3.ToolButton {
                id: closeButton

                icon.name: "window-close-symbolic"
                text: "关闭"
                display: PlasmaComponents3.AbstractButton.IconOnly
                Accessible.name: text
                onClicked: full.folderRoot.closeFolder()

                PlasmaComponents3.ToolTip {
                    text: closeButton.text
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 1
            color: full.accentColor
            opacity: 0.24
        }

        DragAndDrop.DropArea {
            id: contentDropArea

            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: full.visibleRows * full.delegateHeight
            Layout.maximumHeight: full.maximumVisibleRows * full.delegateHeight
            preventStealing: true

            onDragEnter: event => {
                if (full.folderRoot.isImmutable || !event.mimeData.hasUrls) {
                    event.ignore();
                    return;
                }
                full.dropActive = true;
            }
            onDragLeave: full.dropActive = false
            onDrop: event => {
                full.dropActive = false;
                if (full.folderRoot.isImmutable || !event.mimeData.hasUrls) {
                    event.ignore();
                    return;
                }
                full.folderRoot.addUrls(event.mimeData.urls);
                event.accept(Qt.CopyAction);
                full.folderRoot.reactivateFolder();
            }

            GridView {
                id: appGrid

                anchors.fill: parent
                clip: true
                model: full.folderRoot.applicationsModel
                cellWidth: width / full.columns
                cellHeight: full.delegateHeight
                keyNavigationEnabled: true
                keyNavigationWraps: true
                boundsBehavior: Flickable.StopAtBounds

                delegate: ApplicationDelegate {
                    required property int index
                    required property string display
                    required property var decoration
                    required property string favoriteId

                    width: appGrid.cellWidth
                    height: appGrid.cellHeight
                    folderRoot: full.folderRoot
                    modelIndex: index
                    appName: display
                    appIcon: decoration
                    applicationId: favoriteId
                }

                QQC2.ScrollBar.vertical: PlasmaComponents3.ScrollBar {
                    policy: full.needsScrolling
                        ? PlasmaComponents3.ScrollBar.AsNeeded
                        : PlasmaComponents3.ScrollBar.AlwaysOff
                }
            }

            Column {
                anchors.centerIn: parent
                width: Math.min(parent.width - Kirigami.Units.largeSpacing * 2, Kirigami.Units.gridUnit * 15)
                spacing: Kirigami.Units.largeSpacing
                visible: full.folderRoot.applicationsModel.count === 0

                Kirigami.Icon {
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Kirigami.Units.iconSizes.enormous
                    height: width
                    source: "folder-applications"
                    opacity: 0.72
                }

                PlasmaComponents3.Label {
                    width: parent.width
                    text: "这个文件夹还是空的"
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                }

                PlasmaComponents3.Label {
                    width: parent.width
                    text: "把应用或文件拖到这里，或点击下方按钮选择已安装应用。"
                    wrapMode: Text.Wrap
                    horizontalAlignment: Text.AlignHCenter
                    opacity: 0.72
                }

                PlasmaComponents3.Button {
                    anchors.horizontalCenter: parent.horizontalCenter
                    enabled: !full.folderRoot.isImmutable
                    icon.name: "list-add"
                    text: "添加应用"
                    onClicked: full.folderRoot.openConfiguration()
                }
            }

            Rectangle {
                anchors {
                    fill: parent
                    margins: Kirigami.Units.smallSpacing
                }
                z: 10
                visible: full.dropActive
                radius: Kirigami.Units.cornerRadius * 2
                color: {
                    return Qt.rgba(
                        full.accentColor.r,
                        full.accentColor.g,
                        full.accentColor.b,
                        0.18);
                }
                border.width: 2
                border.color: full.accentColor

                PlasmaComponents3.Label {
                    anchors.centerIn: parent
                    text: "松开以添加到文件夹"
                    font.bold: true
                }
            }
        }

    }
}
