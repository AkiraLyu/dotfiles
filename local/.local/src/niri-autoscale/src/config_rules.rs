use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use kdl::{KdlDocument, KdlNode};
use niri_ipc::Window;
use regex::Regex;

const MAX_INCLUDE_DEPTH: u8 = 10;

#[derive(Debug, Default)]
pub(crate) struct RuleSet {
    rules: Vec<WindowRule>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct InitialRuleProperties {
    pub(crate) opens_maximized: bool,
    pub(crate) opens_floating: bool,
    pub(crate) has_explicit_size: bool,
}

#[derive(Debug)]
struct WindowRule {
    matches: Vec<WindowMatch>,
    excludes: Vec<WindowMatch>,
    open_floating: Option<bool>,
    open_maximized: Option<bool>,
    open_maximized_to_edges: Option<bool>,
    has_explicit_size: bool,
}

#[derive(Debug, Default)]
struct WindowMatch {
    app_id: Option<Regex>,
    title: Option<Regex>,
    is_active: Option<bool>,
    is_focused: Option<bool>,
    is_active_in_column: Option<bool>,
    is_floating: Option<bool>,
    is_window_cast_target: Option<bool>,
    is_urgent: Option<bool>,
    at_startup: Option<bool>,
}

impl RuleSet {
    pub(crate) fn load(path: &Path) -> Result<Self> {
        let mut rules = Self::default();
        let mut include_stack = HashSet::new();
        rules.load_file(path, 0, &mut include_stack)?;
        Ok(rules)
    }

    pub(crate) fn resolve(&self, window: &Window) -> InitialRuleProperties {
        let mut open_floating = None;
        let mut open_maximized = None;
        let mut open_maximized_to_edges = None;
        let mut has_explicit_size = false;

        for rule in &self.rules {
            let included = rule.matches.is_empty()
                || rule
                    .matches
                    .iter()
                    .any(|matcher| matcher.matches_initial(window));
            let excluded = rule
                .excludes
                .iter()
                .any(|matcher| matcher.matches_initial(window));
            if !included || excluded {
                continue;
            }

            if let Some(value) = rule.open_floating {
                open_floating = Some(value);
            }
            if let Some(value) = rule.open_maximized {
                open_maximized = Some(value);
            }
            if let Some(value) = rule.open_maximized_to_edges {
                open_maximized_to_edges = Some(value);
            }
            has_explicit_size |= rule.has_explicit_size;
        }

        InitialRuleProperties {
            opens_maximized: open_maximized.unwrap_or(false)
                || open_maximized_to_edges.unwrap_or(false),
            opens_floating: open_floating.unwrap_or(false),
            has_explicit_size,
        }
    }

    #[cfg(test)]
    pub(crate) fn from_kdl(text: &str) -> Result<Self> {
        let document = KdlDocument::parse_v1(text).context("cannot parse test niri config")?;
        let mut rules = Self::default();
        for node in document.nodes() {
            if node.name().value() == "window-rule" {
                rules.rules.push(WindowRule::parse(node)?);
            }
        }
        Ok(rules)
    }

    fn load_file(
        &mut self,
        path: &Path,
        depth: u8,
        include_stack: &mut HashSet<PathBuf>,
    ) -> Result<()> {
        if depth >= MAX_INCLUDE_DEPTH {
            bail!("niri config includes exceed {MAX_INCLUDE_DEPTH} levels");
        }

        let path = path.to_path_buf();
        if !include_stack.insert(path.clone()) {
            bail!("recursive niri config include: {}", path.display());
        }

        let result = self.load_file_inner(&path, depth, include_stack);
        include_stack.remove(&path);
        result
    }

    fn load_file_inner(
        &mut self,
        path: &Path,
        depth: u8,
        include_stack: &mut HashSet<PathBuf>,
    ) -> Result<()> {
        let text = fs::read_to_string(path)
            .with_context(|| format!("cannot read niri config {}", path.display()))?;
        let document = KdlDocument::parse_v1(&text)
            .with_context(|| format!("cannot parse niri config {}", path.display()))?;
        let base = path.parent().unwrap_or_else(|| Path::new(""));

        for node in document.nodes() {
            match node.name().value() {
                "include" => {
                    let Some(include) = node.get(0).and_then(|value| value.as_string()) else {
                        bail!("include without a path in {}", path.display());
                    };
                    let optional = node
                        .get("optional")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(false);
                    let include = expand_include_path(base, include);

                    if optional && !include.exists() {
                        continue;
                    }
                    self.load_file(&include, depth + 1, include_stack)?;
                }
                "window-rule" => self.rules.push(WindowRule::parse(node)?),
                _ => {}
            }
        }

        Ok(())
    }
}

impl WindowRule {
    fn parse(node: &KdlNode) -> Result<Self> {
        let mut matches = Vec::new();
        let mut excludes = Vec::new();
        let mut open_floating = None;
        let mut open_maximized = None;
        let mut open_maximized_to_edges = None;
        let mut has_explicit_size = false;

        for child in node.iter_children() {
            match child.name().value() {
                "match" => matches.push(WindowMatch::parse(child)?),
                "exclude" => excludes.push(WindowMatch::parse(child)?),
                "open-floating" => open_floating = Some(bool_argument(child)?),
                "open-maximized" => open_maximized = Some(bool_argument(child)?),
                "open-maximized-to-edges" => {
                    open_maximized_to_edges = Some(bool_argument(child)?);
                }
                "default-column-width" | "default-window-height" => {
                    has_explicit_size = true;
                }
                _ => {}
            }
        }

        Ok(Self {
            matches,
            excludes,
            open_floating,
            open_maximized,
            open_maximized_to_edges,
            has_explicit_size,
        })
    }
}

impl WindowMatch {
    fn parse(node: &KdlNode) -> Result<Self> {
        Ok(Self {
            app_id: regex_property(node, "app-id")?,
            title: regex_property(node, "title")?,
            is_active: bool_property(node, "is-active"),
            is_focused: bool_property(node, "is-focused"),
            is_active_in_column: bool_property(node, "is-active-in-column"),
            is_floating: bool_property(node, "is-floating"),
            is_window_cast_target: bool_property(node, "is-window-cast-target"),
            is_urgent: bool_property(node, "is-urgent"),
            at_startup: bool_property(node, "at-startup"),
        })
    }

    fn matches_initial(&self, window: &Window) -> bool {
        if let Some(regex) = &self.app_id {
            if !window
                .app_id
                .as_deref()
                .is_some_and(|value| regex.is_match(value))
            {
                return false;
            }
        }
        if let Some(regex) = &self.title {
            if !window
                .title
                .as_deref()
                .is_some_and(|value| regex.is_match(value))
            {
                return false;
            }
        }

        // Match the values niri uses while resolving initial-configure rules.
        // Unmapped windows are not focused, urgent, floating or cast targets;
        // they are initially active in their new column. IPC has no direct
        // equivalent for the pending Activated state, so is-active uses the
        // focus state from the first mapped event as the closest equivalent.
        bool_matches(self.is_active, window.is_focused)
            && bool_matches(self.is_focused, false)
            && bool_matches(self.is_active_in_column, true)
            && bool_matches(self.is_floating, false)
            && bool_matches(self.is_window_cast_target, false)
            && bool_matches(self.is_urgent, false)
            && bool_matches(self.at_startup, false)
    }
}

fn bool_matches(expected: Option<bool>, actual: bool) -> bool {
    expected.is_none_or(|expected| expected == actual)
}

fn bool_argument(node: &KdlNode) -> Result<bool> {
    node.get(0)
        .and_then(|value| value.as_bool())
        .with_context(|| format!("{} requires a boolean argument", node.name().value()))
}

fn bool_property(node: &KdlNode, name: &str) -> Option<bool> {
    node.get(name).and_then(|value| value.as_bool())
}

fn regex_property(node: &KdlNode, name: &str) -> Result<Option<Regex>> {
    let Some(value) = node.get(name) else {
        return Ok(None);
    };
    let value = value
        .as_string()
        .with_context(|| format!("{name} must be a string"))?;
    let regex = Regex::new(value).with_context(|| format!("invalid {name} regex {value:?}"))?;
    Ok(Some(regex))
}

fn expand_include_path(base: &Path, include: &str) -> PathBuf {
    let include = Path::new(include);
    if let Ok(rest) = include.strip_prefix("~") {
        if let Some(home) = env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    base.join(include)
}

pub(crate) fn config_path(explicit: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(path) = explicit {
        return Ok(path);
    }
    if let Some(path) = env::var_os("NIRI_CONFIG") {
        return Ok(PathBuf::from(path));
    }
    if let Some(config_home) = env::var_os("XDG_CONFIG_HOME") {
        return Ok(PathBuf::from(config_home).join("niri/config.kdl"));
    }
    if let Some(home) = env::var_os("HOME") {
        return Ok(PathBuf::from(home).join(".config/niri/config.kdl"));
    }
    bail!("cannot locate niri config; pass --config PATH")
}

#[cfg(test)]
mod tests {
    use niri_ipc::{Window, WindowLayout};

    use super::RuleSet;

    fn window(app_id: &str, title: &str) -> Window {
        Window {
            id: 1,
            title: Some(title.into()),
            app_id: Some(app_id.into()),
            pid: Some(1000),
            workspace_id: Some(1),
            is_focused: true,
            is_floating: false,
            is_urgent: false,
            layout: WindowLayout {
                pos_in_scrolling_layout: Some((1, 1)),
                tile_size: (800.0, 600.0),
                window_size: (800, 600),
                tile_pos_in_workspace_view: None,
                window_offset_in_tile: (0.0, 0.0),
            },
            focus_timestamp: None,
        }
    }

    fn rules(text: &str) -> RuleSet {
        RuleSet::from_kdl(text).unwrap()
    }

    #[test]
    fn resolves_maximized_and_sized_rules() {
        let rules = rules(
            r#"
                window-rule {
                    match app-id="^firefox$"
                    open-maximized true
                }
                window-rule {
                    match app-id="^kitty$"
                    open-floating true
                    default-column-width { fixed 900; }
                    default-window-height { fixed 600; }
                }
            "#,
        );

        assert!(rules.resolve(&window("firefox", "Browser")).opens_maximized);
        assert!(
            rules
                .resolve(&window("kitty", "Terminal"))
                .has_explicit_size
        );
        assert!(rules.resolve(&window("kitty", "Terminal")).opens_floating);
        assert_eq!(rules.resolve(&window("other", "Other")), Default::default());
    }

    #[test]
    fn applies_match_or_exclude_and_later_overrides() {
        let rules = rules(
            r#"
                window-rule {
                    match app-id="browser"
                    match title="Special"
                    exclude title="Private"
                    open-maximized true
                }
                window-rule {
                    match app-id="^browser$"
                    open-floating true
                    open-maximized false
                    default-column-width {}
                }
                window-rule {
                    match title="Normal"
                    open-floating false
                }
            "#,
        );

        let properties = rules.resolve(&window("browser", "Normal"));
        assert!(!properties.opens_maximized);
        assert!(!properties.opens_floating);
        assert!(properties.has_explicit_size);
        assert_eq!(
            rules.resolve(&window("other", "Private Special")),
            Default::default()
        );
    }
}
