use std::collections::{HashMap, HashSet};

use niri_ipc::{Event, Window};

use crate::config_rules::RuleSet;

/// A compositor-side change requested by the state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Operation {
    FloatResizeAndCenter {
        window_id: u64,
        width: i32,
        height: i32,
    },
    FloatAndCenter {
        window_id: u64,
    },
    Center {
        window_id: u64,
    },
    TileAndRestore {
        window_id: u64,
        width: i32,
        height: i32,
    },
}

#[derive(Debug, Clone, Copy)]
struct PendingCenter {
    initial_size: (i32, i32),
    last_size: (i32, i32),
    target_size: (i32, i32),
    observed_size_changes: u8,
}

#[derive(Debug, Clone)]
struct ManagedFirstWindow {
    workspace_id: u64,
    opened_floating_by_rule: bool,
    original_size: (i32, i32),
    pid: Option<i32>,
    app_id: Option<String>,
}

/// Tracks niri's event stream and identifies new windows on empty workspaces.
///
/// Windows present in the initial snapshot are deliberately left alone. This
/// makes restarting the process safe: it will begin applying the policy only
/// after a workspace next becomes empty and receives a new window.
#[derive(Debug)]
pub(crate) struct Engine {
    floating_width: i32,
    floating_height: i32,
    initialized: bool,
    windows: HashMap<u64, Window>,
    pending_new_windows: HashSet<u64>,
    pending_centers: HashMap<u64, PendingCenter>,
    managed_first_windows: HashMap<u64, ManagedFirstWindow>,
    maximized_windows: HashSet<u64>,
    rules: RuleSet,
}

impl Engine {
    pub(crate) fn new(floating_width: i32, floating_height: i32) -> Self {
        debug_assert!(floating_width > 0);
        debug_assert!(floating_height > 0);

        Self {
            floating_width,
            floating_height,
            initialized: false,
            windows: HashMap::new(),
            pending_new_windows: HashSet::new(),
            pending_centers: HashMap::new(),
            managed_first_windows: HashMap::new(),
            maximized_windows: HashSet::new(),
            rules: RuleSet::default(),
        }
    }

    pub(crate) fn replace_rules(&mut self, rules: RuleSet) {
        self.rules = rules;
    }

    pub(crate) fn replace_maximized_windows(&mut self, windows: HashSet<u64>) {
        self.pending_centers
            .retain(|window_id, _| !windows.contains(window_id));
        self.maximized_windows = windows;
    }

    pub(crate) fn handle_event(&mut self, event: Event) -> Vec<Operation> {
        let mut operations = Vec::new();

        match event {
            Event::WindowsChanged { windows } => {
                self.windows = windows
                    .into_iter()
                    .map(|window| (window.id, window))
                    .collect();
                self.pending_new_windows.clear();
                self.pending_centers
                    .retain(|id, _| self.windows.contains_key(id));
                self.managed_first_windows
                    .retain(|id, _| self.windows.contains_key(id));

                // The first WindowsChanged event is the event stream's initial
                // snapshot. Never reinterpret those windows as newly opened.
                if !self.initialized {
                    self.initialized = true;
                    return operations;
                }
            }
            Event::WindowOpenedOrChanged { window } => {
                let id = window.id;
                let size = window.layout.window_size;
                let workspace_id = window.workspace_id;
                let is_new = self.initialized && !self.windows.contains_key(&id);
                self.windows.insert(id, window);

                if let (Some(managed), Some(workspace_id)) =
                    (self.managed_first_windows.get_mut(&id), workspace_id)
                {
                    managed.workspace_id = workspace_id;
                }

                if is_new {
                    self.pending_new_windows.insert(id);
                }

                let mut just_managed = false;
                if self.pending_new_windows.contains(&id)
                    && self
                        .windows
                        .get(&id)
                        .is_some_and(|window| window.workspace_id.is_some())
                {
                    self.pending_new_windows.remove(&id);
                    if let Some(operation) = self.handle_subsequent_window(id) {
                        operations.push(operation);
                    }
                    if let Some(operation) = self.manage_new_window_if_workspace_was_empty(id) {
                        operations.push(operation);
                        just_managed = true;
                    }
                }

                if !just_managed {
                    if let Some(operation) = self.recenter_after_resize(id, size) {
                        operations.push(operation);
                    }
                }
            }
            Event::WindowClosed { id } => {
                self.windows.remove(&id);
                self.pending_new_windows.remove(&id);
                self.pending_centers.remove(&id);
                self.managed_first_windows.remove(&id);
            }
            Event::WindowLayoutsChanged { changes } => {
                for (id, layout) in changes {
                    let size = layout.window_size;
                    if let Some(window) = self.windows.get_mut(&id) {
                        window.layout = layout;
                    }
                    if let Some(operation) = self.recenter_after_resize(id, size) {
                        operations.push(operation);
                    }
                }
            }
            _ => {}
        }

        operations
    }

    fn manage_new_window_if_workspace_was_empty(&mut self, window_id: u64) -> Option<Operation> {
        let window = self.windows.get(&window_id)?;
        let workspace_id = window.workspace_id?;

        let window_count = self
            .windows
            .values()
            .filter(|candidate| candidate.workspace_id == Some(workspace_id))
            .count();

        if window_count != 1 {
            return None;
        }

        let rule_properties = self.rules.resolve(window);
        if rule_properties.opens_maximized || self.maximized_windows.contains(&window_id) {
            return None;
        }

        let initial_size = window.layout.window_size;
        let target_size = (self.floating_width, self.floating_height);
        let preserve_rule_size =
            rule_properties.opens_floating && rule_properties.has_explicit_size;
        self.managed_first_windows.insert(
            window_id,
            ManagedFirstWindow {
                workspace_id,
                opened_floating_by_rule: rule_properties.opens_floating,
                original_size: (initial_size.0.max(1), initial_size.1.max(1)),
                pid: window.pid,
                app_id: window.app_id.clone(),
            },
        );

        if !preserve_rule_size && initial_size != target_size {
            self.pending_centers.insert(
                window_id,
                PendingCenter {
                    initial_size,
                    last_size: initial_size,
                    target_size,
                    observed_size_changes: 0,
                },
            );
        }

        if preserve_rule_size {
            Some(Operation::FloatAndCenter { window_id })
        } else {
            Some(Operation::FloatResizeAndCenter {
                window_id,
                width: self.floating_width,
                height: self.floating_height,
            })
        }
    }

    fn handle_subsequent_window(&mut self, window_id: u64) -> Option<Operation> {
        let window = self.windows.get(&window_id)?;
        let workspace_id = window.workspace_id?;

        let (&first_window_id, managed) =
            self.managed_first_windows
                .iter()
                .find(|(first_window_id, managed)| {
                    **first_window_id != window_id && managed.workspace_id == workspace_id
                })?;

        // Native xdg_popup surfaces never enter niri's toplevel IPC stream. A
        // toolkit may instead implement a popup as an automatically-floating
        // child toplevel. niri IPC 26.4 does not expose parent IDs, so use the
        // strongest available signal: same PID, same app-id and floating.
        let same_pid = window.pid.is_some() && window.pid == managed.pid;
        let same_app_id = window.app_id.is_some() && window.app_id == managed.app_id;
        if window.is_floating && same_pid && same_app_id {
            return None;
        }

        let first_is_maximized = self.maximized_windows.contains(&first_window_id);
        let managed = self.managed_first_windows.remove(&first_window_id)?;
        self.pending_centers.remove(&first_window_id);

        // A real xdg-toplevel maximized state can come from the application,
        // an action, or an open-maximized-to-edges rule. Never unmaximize it
        // when a subsequent window appears.
        if first_is_maximized {
            return None;
        }

        // Respect an open-floating window rule on the first window: keep the
        // adjusted floating size and never touch it again. Only a first window
        // without that rule is restored to its original tiled layout.
        if managed.opened_floating_by_rule {
            return None;
        }

        Some(Operation::TileAndRestore {
            window_id: first_window_id,
            width: managed.original_size.0,
            height: managed.original_size.1,
        })
    }

    fn recenter_after_resize(&mut self, window_id: u64, size: (i32, i32)) -> Option<Operation> {
        let pending = self.pending_centers.get_mut(&window_id)?;
        if size == pending.last_size {
            return None;
        }

        pending.last_size = size;
        pending.observed_size_changes = pending.observed_size_changes.saturating_add(1);

        // Width and height requests can occasionally commit separately. Keep
        // watching when one axis still has its initial value, then center once
        // more after the other axis catches up. The two-change limit prevents
        // a constrained client from being tracked indefinitely.
        let width_still_pending =
            size.0 == pending.initial_size.0 && size.0 != pending.target_size.0;
        let height_still_pending =
            size.1 == pending.initial_size.1 && size.1 != pending.target_size.1;
        let resize_complete = size == pending.target_size
            || (!width_still_pending && !height_still_pending)
            || pending.observed_size_changes >= 2;

        if resize_complete {
            self.pending_centers.remove(&window_id);
        }

        Some(Operation::Center { window_id })
    }
}

#[cfg(test)]
mod tests {
    use niri_ipc::{Event, Window, WindowLayout};

    use super::{Engine, Operation};
    use crate::config_rules::RuleSet;

    const FLOAT: Operation = Operation::FloatResizeAndCenter {
        window_id: 1,
        width: 1280,
        height: 720,
    };

    fn window(id: u64, workspace_id: Option<u64>, width: i32, height: i32) -> Window {
        Window {
            id,
            title: Some(format!("window-{id}")),
            app_id: Some("test".into()),
            pid: Some(1000 + id as i32),
            workspace_id,
            is_focused: false,
            is_floating: false,
            is_urgent: false,
            layout: WindowLayout {
                pos_in_scrolling_layout: Some((1, 1)),
                tile_size: (f64::from(width), f64::from(height)),
                window_size: (width, height),
                tile_pos_in_workspace_view: None,
                window_offset_in_tile: (0.0, 0.0),
            },
            focus_timestamp: None,
        }
    }

    fn initialize(engine: &mut Engine, windows: Vec<Window>) {
        assert!(engine
            .handle_event(Event::WindowsChanged { windows })
            .is_empty());
    }

    fn engine_with_rules(rules: &str) -> Engine {
        let mut engine = Engine::new(1280, 720);
        engine.replace_rules(RuleSet::from_kdl(rules).unwrap());
        engine
    }

    #[test]
    fn floats_the_first_new_window_on_an_empty_workspace() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);

        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });

        assert_eq!(operations, vec![FLOAT]);
    }

    #[test]
    fn does_nothing_to_a_first_window_opened_maximized_by_rule() {
        let mut engine = engine_with_rules(
            r#"
                window-rule {
                    match app-id="^test$"
                    open-maximized true
                }
            "#,
        );
        initialize(&mut engine, vec![]);

        let first = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 1920, 1080),
        });
        let second = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(2, Some(10), 700, 500),
        });

        assert!(first.is_empty());
        assert!(second.is_empty());
    }

    #[test]
    fn does_nothing_to_a_first_window_opened_with_a_real_maximized_state() {
        let mut engine = Engine::new(1280, 720);
        engine.replace_maximized_windows([1].into_iter().collect());
        initialize(&mut engine, vec![]);

        let first = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 1920, 1080),
        });
        let second = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(2, Some(10), 700, 500),
        });

        assert!(first.is_empty());
        assert!(second.is_empty());
    }

    #[test]
    fn keeps_the_first_window_maximized_when_it_is_maximized_later() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);
        engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });

        engine.replace_maximized_windows([1].into_iter().collect());
        let maximized_layout = window(1, Some(10), 1920, 1080).layout;
        assert!(engine
            .handle_event(Event::WindowLayoutsChanged {
                changes: vec![(1, maximized_layout)],
            })
            .is_empty());
        let second = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(2, Some(10), 700, 500),
        });
        let third = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(3, Some(10), 600, 400),
        });

        assert!(second.is_empty());
        assert!(third.is_empty());
    }

    #[test]
    fn preserves_a_size_set_by_a_floating_window_rule() {
        let mut engine = engine_with_rules(
            r#"
                window-rule {
                    match app-id="^test$"
                    open-floating true
                    default-column-width { fixed 900; }
                    default-window-height { fixed 600; }
                }
            "#,
        );
        initialize(&mut engine, vec![]);

        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });

        assert_eq!(operations, vec![Operation::FloatAndCenter { window_id: 1 }]);
    }

    #[test]
    fn ignores_a_size_rule_when_the_rule_does_not_open_floating() {
        let mut engine = engine_with_rules(
            r#"
                window-rule {
                    match app-id="^test$"
                    default-column-width { fixed 900; }
                    default-window-height { fixed 600; }
                }
            "#,
        );
        initialize(&mut engine, vec![]);

        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });

        assert_eq!(operations, vec![FLOAT]);
    }

    #[test]
    fn restores_an_initially_tiled_first_window_when_a_second_opens() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);
        engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });

        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(2, Some(10), 700, 500),
        });

        assert_eq!(
            operations,
            vec![Operation::TileAndRestore {
                window_id: 1,
                width: 900,
                height: 600,
            }]
        );
    }

    #[test]
    fn leaves_later_floating_window_rules_untouched() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);
        engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });

        let mut second = window(2, Some(10), 700, 500);
        second.is_floating = true;
        let operations = engine.handle_event(Event::WindowOpenedOrChanged { window: second });

        assert_eq!(
            operations,
            vec![Operation::TileAndRestore {
                window_id: 1,
                width: 900,
                height: 600,
            }]
        );
    }

    #[test]
    fn keeps_a_first_window_opened_floating_by_rule_unchanged() {
        let mut engine = engine_with_rules(
            r#"
                window-rule {
                    match app-id="^test$"
                    open-floating true
                }
            "#,
        );
        initialize(&mut engine, vec![]);

        let mut first = window(1, Some(10), 900, 600);
        first.is_floating = true;
        engine.handle_event(Event::WindowOpenedOrChanged { window: first });

        let second = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(2, Some(10), 700, 500),
        });
        let third = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(3, Some(10), 600, 400),
        });

        assert!(second.is_empty());
        assert!(third.is_empty());
    }

    #[test]
    fn restores_an_automatically_floating_window_without_an_open_floating_rule() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);

        let mut first = window(1, Some(10), 900, 600);
        first.is_floating = true;
        engine.handle_event(Event::WindowOpenedOrChanged { window: first });

        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(2, Some(10), 700, 500),
        });

        assert_eq!(
            operations,
            vec![Operation::TileAndRestore {
                window_id: 1,
                width: 900,
                height: 600,
            }]
        );
    }

    #[test]
    fn ignores_windows_from_the_initial_snapshot() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![window(1, Some(10), 900, 600)]);

        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(2, Some(10), 700, 500),
        });

        assert!(operations.is_empty());
    }

    #[test]
    fn tracks_workspaces_independently() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);

        let first = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });
        let other_workspace = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(2, Some(20), 800, 500),
        });

        assert_eq!(first, vec![FLOAT]);
        assert_eq!(
            other_workspace,
            vec![Operation::FloatResizeAndCenter {
                window_id: 2,
                width: 1280,
                height: 720,
            }]
        );
    }

    #[test]
    fn waits_until_a_new_window_has_a_workspace() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);

        assert!(engine
            .handle_event(Event::WindowOpenedOrChanged {
                window: window(1, None, 900, 600),
            })
            .is_empty());

        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });
        assert_eq!(operations, vec![FLOAT]);
    }

    #[test]
    fn closing_the_managed_window_allows_the_next_window_to_be_first() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);
        engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });
        engine.handle_event(Event::WindowClosed { id: 1 });

        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(2, Some(10), 700, 500),
        });

        assert_eq!(
            operations,
            vec![Operation::FloatResizeAndCenter {
                window_id: 2,
                width: 1280,
                height: 720,
            }]
        );
    }

    #[test]
    fn recenters_after_the_first_window_commits_its_requested_size() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);
        engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(1, Some(10), 900, 600),
        });

        let mut changed = window(1, Some(10), 1280, 720);
        changed.is_floating = true;
        let operations = engine.handle_event(Event::WindowOpenedOrChanged { window: changed });

        assert_eq!(operations, vec![Operation::Center { window_id: 1 }]);

        let mut position_only = window(1, Some(10), 1280, 720);
        position_only.is_floating = true;
        position_only.layout.tile_pos_in_workspace_view = Some((100.0, 50.0));
        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: position_only,
        });
        assert!(operations.is_empty());
    }

    #[test]
    fn ignores_a_popup_created_by_the_first_window() {
        let mut engine = Engine::new(1280, 720);
        initialize(&mut engine, vec![]);

        let mut first = window(1, Some(10), 900, 600);
        first.pid = Some(4242);
        engine.handle_event(Event::WindowOpenedOrChanged { window: first });

        // Native xdg_popup surfaces do not appear as IPC toplevel windows. A
        // popup implemented as a child toplevel can appear here; model it with
        // the same PID/app-id and niri's automatic floating state.
        let mut popup = window(2, Some(10), 400, 300);
        popup.pid = Some(4242);
        popup.is_floating = true;
        let operations = engine.handle_event(Event::WindowOpenedOrChanged { window: popup });

        assert!(operations.is_empty());

        // Ignoring the popup must not consume the first real subsequent
        // window: that window still restores an originally tiled first window.
        let operations = engine.handle_event(Event::WindowOpenedOrChanged {
            window: window(3, Some(10), 700, 500),
        });
        assert_eq!(
            operations,
            vec![Operation::TileAndRestore {
                window_id: 1,
                width: 900,
                height: 600,
            }]
        );
    }
}
