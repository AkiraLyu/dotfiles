pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls as QQC2

import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents3

Item {
    id: delegateRoot

    required property var folderRoot
    required property int modelIndex
    required property string appName
    required property var appIcon
    required property string applicationId
    property bool popupRegistered: false

    function registerPopup() {
        if (!popupRegistered) {
            popupRegistered = true;
            folderRoot.registerChildPopup();
        }
    }

    function unregisterPopup() {
        if (popupRegistered) {
            popupRegistered = false;
            folderRoot.unregisterChildPopup();
        }
    }

    function dismissPopup() {
        if (contextMenu.visible) {
            contextMenu.close();
        } else {
            unregisterPopup();
        }
    }

    activeFocusOnTab: true
    Accessible.name: appName
    Accessible.description: "打开 %1".arg(appName)
    Accessible.role: Accessible.Button
    Accessible.onPressAction: folderRoot.launch(modelIndex)

    Rectangle {
        anchors {
            fill: parent
            margins: Kirigami.Units.smallSpacing / 2
        }
        radius: Kirigami.Units.cornerRadius * 1.5
        color: {
            if (delegateRoot.activeFocus || pointer.pressed) {
                return Kirigami.Theme.focusColor;
            }
            if (pointer.containsMouse) {
                return Kirigami.Theme.hoverColor;
            }
            return "transparent";
        }
        opacity: delegateRoot.activeFocus || pointer.containsMouse || pointer.pressed ? 0.24 : 0

        Behavior on opacity {
            NumberAnimation {
                duration: Kirigami.Units.shortDuration
            }
        }
    }

    Kirigami.Icon {
        id: icon

        anchors {
            top: parent.top
            topMargin: Kirigami.Units.smallSpacing
            horizontalCenter: parent.horizontalCenter
        }
        width: Math.min(Kirigami.Units.iconSizes.huge, parent.width * 0.56)
        height: width
        source: delegateRoot.appIcon
        scale: pointer.containsMouse ? 1.06 : 1

        Behavior on scale {
            NumberAnimation {
                duration: Kirigami.Units.shortDuration
                easing.type: Easing.OutCubic
            }
        }
    }

    PlasmaComponents3.Label {
        anchors {
            top: icon.bottom
            topMargin: Kirigami.Units.smallSpacing / 2
            left: parent.left
            right: parent.right
            bottom: parent.bottom
            leftMargin: Kirigami.Units.smallSpacing
            rightMargin: Kirigami.Units.smallSpacing
        }
        visible: delegateRoot.folderRoot.showLabels
        text: delegateRoot.appName
        textFormat: Text.PlainText
        elide: Text.ElideRight
        maximumLineCount: 2
        wrapMode: Text.Wrap
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignTop
        font.pointSize: Kirigami.Theme.smallFont.pointSize
    }

    MouseArea {
        id: pointer

        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        hoverEnabled: true

        onClicked: mouse => {
            delegateRoot.forceActiveFocus();
            if (mouse.button === Qt.RightButton) {
                contextMenu.popup();
            } else {
                delegateRoot.folderRoot.launch(delegateRoot.modelIndex);
            }
        }
        onPressAndHold: contextMenu.popup()
    }

    Keys.onEnterPressed: folderRoot.launch(modelIndex)
    Keys.onReturnPressed: folderRoot.launch(modelIndex)
    Keys.onSpacePressed: folderRoot.launch(modelIndex)
    Keys.onDeletePressed: {
        if (!folderRoot.isImmutable) {
            folderRoot.removeFavorite(applicationId);
        }
    }

    Connections {
        target: delegateRoot.folderRoot

        function onPopupDismissRevisionChanged() {
            delegateRoot.dismissPopup();
        }

        function onDialogVisibleChanged() {
            if (!delegateRoot.folderRoot.dialogVisible) {
                delegateRoot.dismissPopup();
            }
        }
    }

    Component.onDestruction: unregisterPopup()

    PlasmaComponents3.Menu {
        id: contextMenu

        closePolicy: QQC2.Popup.CloseOnEscape
            | QQC2.Popup.CloseOnPressOutside
            | QQC2.Popup.CloseOnPressOutsideParent
        onOpened: delegateRoot.registerPopup()
        onClosed: delegateRoot.unregisterPopup()

        PlasmaComponents3.MenuItem {
            icon.name: "media-playback-start"
            text: "打开"
            onTriggered: delegateRoot.folderRoot.launch(delegateRoot.modelIndex)
        }

        PlasmaComponents3.MenuItem {
            enabled: delegateRoot.modelIndex > 0 && !delegateRoot.folderRoot.isImmutable
            icon.name: "go-previous"
            text: "向前移动"
            onTriggered: delegateRoot.folderRoot.moveFavorite(
                delegateRoot.modelIndex,
                delegateRoot.modelIndex - 1)
        }

        PlasmaComponents3.MenuItem {
            enabled: delegateRoot.modelIndex < delegateRoot.folderRoot.applicationsModel.count - 1
                && !delegateRoot.folderRoot.isImmutable
            icon.name: "go-next"
            text: "向后移动"
            onTriggered: delegateRoot.folderRoot.moveFavorite(
                delegateRoot.modelIndex,
                delegateRoot.modelIndex + 1)
        }

        PlasmaComponents3.MenuItem {
            enabled: !delegateRoot.folderRoot.isImmutable
            icon.name: "list-remove"
            text: "从文件夹移除"
            onTriggered: delegateRoot.folderRoot.removeFavorite(delegateRoot.applicationId)
        }
    }
}
