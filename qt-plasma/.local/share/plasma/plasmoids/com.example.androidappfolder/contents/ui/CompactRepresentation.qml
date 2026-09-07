pragma ComponentBehavior: Bound

import QtQuick

import org.kde.draganddrop as DragAndDrop
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents3

DragAndDrop.DropArea {
    id: compact

    required property var folderRoot
    property bool dropActive: false
    readonly property real labelHeight: folderRoot.desktopMode
        ? Math.max(folderLabel.implicitHeight, Kirigami.Units.gridUnit)
        : 0
    readonly property real tileSize: Math.max(
        Kirigami.Units.iconSizes.small,
        Math.min(width, height - labelHeight - (folderRoot.desktopMode ? Kirigami.Units.smallSpacing : 0)))

    implicitWidth: folderRoot.desktopMode
        ? Kirigami.Units.gridUnit * 5
        : Kirigami.Units.iconSizes.medium
    implicitHeight: folderRoot.desktopMode
        ? Kirigami.Units.gridUnit * 6
        : Kirigami.Units.iconSizes.medium

    Accessible.name: folderRoot.folderName
    Accessible.description: folderRoot.toolTipSubText
    Accessible.role: Accessible.Button
    Accessible.onPressAction: folderRoot.toggleExpanded()
    activeFocusOnTab: true
    preventStealing: true

    Keys.onEnterPressed: folderRoot.toggleExpanded()
    Keys.onReturnPressed: folderRoot.toggleExpanded()
    Keys.onSpacePressed: folderRoot.toggleExpanded()

    onDragEnter: event => {
        if (folderRoot.isImmutable || !event.mimeData.hasUrls) {
            event.ignore();
            return;
        }
        dropActive = true;
    }
    onDragLeave: dropActive = false
    onDrop: event => {
        dropActive = false;
        if (folderRoot.isImmutable || !event.mimeData.hasUrls) {
            event.ignore();
            return;
        }
        const added = folderRoot.addUrls(event.mimeData.urls);
        event.accept(Qt.CopyAction);
        if (added > 0) {
            folderRoot.expandFolder();
        }
    }

    Item {
        id: tile

        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        width: compact.tileSize
        height: compact.tileSize
        scale: pointer.containsMouse || compact.dropActive || compact.folderRoot.dialogVisible ? 1.04 : 1

        Behavior on scale {
            NumberAnimation {
                duration: Kirigami.Units.shortDuration
                easing.type: Easing.OutCubic
            }
        }

        Rectangle {
            anchors.fill: parent
            radius: Math.max(Kirigami.Units.cornerRadius * 2, width * 0.18)
            color: {
                const accent = Kirigami.Theme.highlightColor;
                return Qt.rgba(accent.r, accent.g, accent.b, compact.dropActive ? 0.44 : 0.25);
            }
            border.width: compact.activeFocus || compact.dropActive || compact.folderRoot.dialogVisible ? 2 : 1
            border.color: {
                const accent = Kirigami.Theme.highlightColor;
                return Qt.rgba(accent.r, accent.g, accent.b, compact.dropActive ? 1 : 0.62);
            }

            Behavior on color {
                ColorAnimation {
                    duration: Kirigami.Units.shortDuration
                }
            }
        }

        GridView {
            id: previewGrid

            anchors.centerIn: parent
            readonly property int previewCount: Math.min(
                4,
                compact.folderRoot.applicationsModel.count)

            width: parent.width * (previewCount === 1 ? 0.34 : 0.68)
            height: parent.height * (previewCount <= 2 ? 0.34 : 0.68)
            cellWidth: width / (previewCount === 1 ? 1 : 2)
            cellHeight: height / (previewCount <= 2 ? 1 : 2)
            clip: true
            interactive: false
            model: compact.folderRoot.applicationsModel

            delegate: Item {
                required property int index
                required property var decoration

                width: previewGrid.cellWidth
                height: previewGrid.cellHeight
                visible: index < 4

                Kirigami.Icon {
                    anchors.centerIn: parent
                    width: Math.min(parent.width, parent.height) * 0.72
                    height: width
                    source: parent.decoration
                }
            }
        }

        Kirigami.Icon {
            anchors.centerIn: parent
            width: parent.width * 0.52
            height: width
            source: "list-add-symbolic"
            opacity: 0.82
            visible: compact.folderRoot.applicationsModel.count === 0
        }
    }

    PlasmaComponents3.Label {
        id: folderLabel

        anchors {
            top: tile.bottom
            topMargin: compact.folderRoot.desktopMode ? Kirigami.Units.smallSpacing : 0
            left: parent.left
            right: parent.right
        }
        height: compact.labelHeight
        visible: compact.folderRoot.desktopMode
        text: compact.folderRoot.folderName
        textFormat: Text.PlainText
        elide: Text.ElideRight
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }

    MouseArea {
        id: pointer

        anchors.fill: parent
        acceptedButtons: Qt.LeftButton
        hoverEnabled: true

        onClicked: {
            compact.forceActiveFocus();
            compact.folderRoot.toggleExpanded();
        }
    }
}
