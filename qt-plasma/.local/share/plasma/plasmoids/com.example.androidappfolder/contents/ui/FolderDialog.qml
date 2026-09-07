pragma ComponentBehavior: Bound

import QtQuick

import org.kde.kirigami as Kirigami
import org.kde.plasma.core as PlasmaCore
import org.kde.taskmanager as TaskManager

PlasmaCore.Dialog {
    id: dialog

    required property var folderRoot
    readonly property rect targetScreen: {
        const geometry = folderRoot.screenGeometry;
        if (geometry.width > 0 && geometry.height > 0) {
            return geometry;
        }
        return Qt.rect(0, 0, 1280, 720);
    }
    readonly property int columns: Math.min(
        4,
        Math.max(3, folderRoot.gridColumns))
    readonly property int maximumVisibleRows: 4
    readonly property int totalRows: Math.max(
        1,
        Math.ceil(folderRoot.applicationsModel.count / columns))
    readonly property int visibleRows: Math.min(maximumVisibleRows, totalRows)
    readonly property real delegateHeight: folderRoot.showLabels
        ? Kirigami.Units.gridUnit * 6
        : Kirigami.Units.gridUnit * 4.5
    readonly property real contentWidth: Math.min(
        targetScreen.width - Kirigami.Units.gridUnit * 4,
        Math.max(
            Kirigami.Units.gridUnit * 30,
            columns * Kirigami.Units.gridUnit * 7))
    readonly property real contentHeight: Math.min(
        targetScreen.height - Kirigami.Units.gridUnit * 5,
        Math.max(
            Kirigami.Units.gridUnit * 23,
            visibleRows * delegateHeight
                + Kirigami.Units.gridUnit * 7))

    location: PlasmaCore.Types.Floating
    type: PlasmaCore.Dialog.DialogWindow
    flags: Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    // Deactivation is handled with a short grace period below. This keeps the
    // drop target alive while an external drag is travelling toward it.
    hideOnWindowDeactivate: false
    backgroundHints: PlasmaCore.Dialog.NoBackground
    color: "transparent"
    visible: false

    x: Math.round(targetScreen.x + (targetScreen.width - width) / 2)
    y: Math.round(targetScreen.y + (targetScreen.height - height) / 2)

    function openCentered() {
        deactivateTimer.stop();
        visible = true;
        Qt.callLater(() => {
            requestActivate();
            content.forceActiveFocus();
        });
    }

    function scheduleDeactivateClose() {
        if (!visible
                || active
                || content.dropActive
                || folderRoot.childPopupOpen) {
            deactivateTimer.stop();
            return;
        }
        deactivateTimer.restart();
    }

    function closeAfterContextSwitch() {
        if (visible) {
            deactivateTimer.stop();
            folderRoot.closeFolder();
        }
    }

    function reactivateAfterDrop() {
        if (!visible) {
            return;
        }
        deactivateTimer.stop();
        Qt.callLater(() => {
            requestActivate();
            content.forceActiveFocus();
        });
    }

    onActiveChanged: {
        if (active) {
            deactivateTimer.stop();
        } else {
            scheduleDeactivateClose();
        }
    }

    onVisibleChanged: {
        if (!visible) {
            deactivateTimer.stop();
            content.dropActive = false;
        }
        folderRoot.dialogVisible = visible;
    }

    data: [
        Timer {
            id: deactivateTimer

            interval: Kirigami.Units.humanMoment
            onTriggered: {
                if (dialog.visible
                        && !dialog.active
                        && !content.dropActive
                        && !dialog.folderRoot.childPopupOpen) {
                    dialog.folderRoot.closeFolder();
                }
            }
        },

        TaskManager.VirtualDesktopInfo {
            onCurrentDesktopChanged: dialog.closeAfterContextSwitch()
        },

        TaskManager.ActivityInfo {
            onCurrentActivityChanged: dialog.closeAfterContextSwitch()
        },

        Connections {
            target: dialog.folderRoot

            function onChildPopupOpenChanged() {
                if (dialog.folderRoot.childPopupOpen) {
                    deactivateTimer.stop();
                } else {
                    dialog.scheduleDeactivateClose();
                }
            }
        },

        Connections {
            target: content

            function onDropActiveChanged() {
                if (content.dropActive) {
                    deactivateTimer.stop();
                } else {
                    dialog.scheduleDeactivateClose();
                }
            }
        }
    ]

    mainItem: FullRepresentation {
        id: content

        width: dialog.contentWidth
        height: dialog.contentHeight
        folderRoot: dialog.folderRoot
        opacity: dialog.visible ? 1 : 0
        scale: dialog.visible ? 1 : 0.94

        Behavior on opacity {
            NumberAnimation {
                duration: Kirigami.Units.longDuration
                easing.type: Easing.OutCubic
            }
        }

        Behavior on scale {
            NumberAnimation {
                duration: Kirigami.Units.longDuration
                easing.type: Easing.OutBack
            }
        }
    }
}
