pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts

import org.kde.kirigami as Kirigami
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid
import org.kde.plasma.private.kicker as Kicker

import "FavoriteUtils.js" as FavoriteUtils

PlasmoidItem {
    id: root

    readonly property var applicationsModel: folderModel
    readonly property bool desktopMode: Plasmoid.formFactor === PlasmaCore.Types.Planar
    readonly property string folderName: Plasmoid.configuration.folderName
    readonly property int gridColumns: Plasmoid.configuration.columns
    readonly property bool showLabels: Plasmoid.configuration.showLabels
    readonly property bool isImmutable: Plasmoid.immutable
    property bool syncingApplications: false
    property bool dialogVisible: false
    property int childPopupCount: 0
    property int popupDismissRevision: 0
    readonly property bool childPopupOpen: childPopupCount > 0

    Layout.minimumWidth: desktopMode ? Kirigami.Units.gridUnit * 4 : Kirigami.Units.iconSizes.smallMedium
    Layout.minimumHeight: desktopMode ? Kirigami.Units.gridUnit * 5 : Kirigami.Units.iconSizes.smallMedium
    Layout.preferredWidth: desktopMode ? Kirigami.Units.gridUnit * 5 : Kirigami.Units.iconSizes.medium
    Layout.preferredHeight: desktopMode ? Kirigami.Units.gridUnit * 6 : Kirigami.Units.iconSizes.medium

    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    Plasmoid.icon: "folder-applications"
    Plasmoid.title: Plasmoid.configuration.folderName
    toolTipMainText: Plasmoid.configuration.folderName
    toolTipSubText: folderModel.count === 0
        ? "拖入应用或文件，或在设置中添加应用"
        : "包含 %1 个项目".arg(folderModel.count)
    preferredRepresentation: compactRepresentation
    activationTogglesExpanded: false

    compactRepresentation: CompactRepresentation {
        folderRoot: root
    }

    fullRepresentation: FullRepresentation {
        folderRoot: root
    }

    FolderDialog {
        id: folderDialog

        folderRoot: root
    }

    Plasmoid.onActivated: root.toggleExpanded()

    function arraysEqual(left, right) {
        return FavoriteUtils.arraysEqual(left, right);
    }

    function normalizeFavorite(rawValue) {
        return FavoriteUtils.normalizeFavorite(rawValue);
    }

    function canonicalFavorites(values) {
        return FavoriteUtils.canonicalFavorites(values);
    }

    function syncModelFromConfiguration() {
        if (syncingApplications) {
            return;
        }

        syncingApplications = true;
        folderModel.favorites = canonicalFavorites(Plasmoid.configuration.applications);
        const actualFavorites = canonicalFavorites(folderModel.favorites);
        if (!arraysEqual(actualFavorites, Plasmoid.configuration.applications)) {
            Plasmoid.configuration.applications = actualFavorites;
        }
        syncingApplications = false;
    }

    function syncConfigurationFromModel() {
        if (syncingApplications) {
            return;
        }

        const favorites = canonicalFavorites(folderModel.favorites);
        if (!arraysEqual(folderModel.favorites, favorites)) {
            syncingApplications = true;
            folderModel.favorites = favorites;
            Plasmoid.configuration.applications = favorites;
            syncingApplications = false;
            return;
        }
        if (!arraysEqual(favorites, Plasmoid.configuration.applications)) {
            syncingApplications = true;
            Plasmoid.configuration.applications = favorites;
            syncingApplications = false;
        }
    }

    function addFavorite(rawValue, targetIndex) {
        const favoriteId = normalizeFavorite(rawValue);
        if (favoriteId.length === 0
                || FavoriteUtils.containsFavorite(
                    folderModel.favorites,
                    favoriteId)) {
            return false;
        }

        const index = Number.isInteger(targetIndex) ? targetIndex : -1;
        folderModel.addFavorite(favoriteId, index);
        return FavoriteUtils.containsFavorite(
            folderModel.favorites,
            favoriteId);
    }

    function addUrls(urls) {
        let added = 0;
        for (const url of urls ?? []) {
            if (addFavorite(url, -1)) {
                ++added;
            }
        }
        return added;
    }

    function removeFavorite(favoriteId) {
        folderModel.removeFavorite(favoriteId);
    }

    function moveFavorite(from, to) {
        if (from < 0 || to < 0 || from >= folderModel.count || to >= folderModel.count) {
            return;
        }
        folderModel.moveRow(from, to);
    }

    function launch(modelIndex) {
        const launched = folderModel.trigger(modelIndex, "", null);
        if (launched && Plasmoid.configuration.closeAfterLaunch) {
            closeFolder();
        }
    }

    function toggleExpanded() {
        if (folderDialog.visible) {
            closeFolder();
        } else {
            expandFolder();
        }
    }

    function expandFolder() {
        dismissTransientPopups();
        folderDialog.openCentered();
    }

    function closeFolder() {
        dismissTransientPopups();
        folderDialog.close();
    }

    function reactivateFolder() {
        folderDialog.reactivateAfterDrop();
    }

    function registerChildPopup() {
        ++childPopupCount;
    }

    function unregisterChildPopup() {
        childPopupCount = Math.max(0, childPopupCount - 1);
    }

    function dismissTransientPopups() {
        ++popupDismissRevision;
    }

    function openConfiguration() {
        closeFolder();
        const configureAction = Plasmoid.internalAction("configure");
        if (configureAction) {
            configureAction.trigger();
        }
    }

    Component.onCompleted: syncModelFromConfiguration()

    Connections {
        target: Plasmoid.configuration

        function onApplicationsChanged() {
            root.syncModelFromConfiguration();
        }
    }

    Kicker.SimpleFavoritesModel {
        id: folderModel

        enabled: !Plasmoid.immutable
        onFavoritesChanged: root.syncConfigurationFromModel()
    }
}
