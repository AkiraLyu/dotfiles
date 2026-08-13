use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result};
use wayland_client::backend::ObjectId;
use wayland_client::globals::{registry_queue_init, GlobalListContents};
use wayland_client::protocol::wl_registry;
use wayland_client::{Connection, Dispatch, EventQueue, Proxy, QueueHandle};
use wayland_protocols::ext::foreign_toplevel_list::v1::client::{
    ext_foreign_toplevel_handle_v1::{self, ExtForeignToplevelHandleV1},
    ext_foreign_toplevel_list_v1::{self, ExtForeignToplevelListV1},
};
use wayland_protocols_wlr::foreign_toplevel::v1::client::{
    zwlr_foreign_toplevel_handle_v1::{self, ZwlrForeignToplevelHandleV1},
    zwlr_foreign_toplevel_manager_v1::{self, ZwlrForeignToplevelManagerV1},
};

/// Reads the real xdg-toplevel maximized state that niri IPC 26.4 omits.
///
/// Niri exposes its IPC window ID through ext-foreign-toplevel-list and the
/// state through wlr-foreign-toplevel-management. In niri 26.04 both lists are
/// emitted from the same map, in the same order, so their creation ordinals
/// provide the bridge between the two protocols.
pub(crate) struct MaximizedState {
    event_queue: EventQueue<ProtocolState>,
    state: ProtocolState,
    _ext_manager: ExtForeignToplevelListV1,
    _wlr_manager: ZwlrForeignToplevelManagerV1,
}

impl MaximizedState {
    pub(crate) fn connect() -> Result<Self> {
        let connection = Connection::connect_to_env()
            .context("cannot connect to Wayland to read maximized window state")?;
        let (globals, mut event_queue) = registry_queue_init::<ProtocolState>(&connection)
            .context("cannot read Wayland globals")?;
        let queue_handle = event_queue.handle();

        let ext_manager = globals
            .bind::<ExtForeignToplevelListV1, _, _>(&queue_handle, 1..=1, ())
            .context("niri did not expose ext-foreign-toplevel-list-v1")?;
        let wlr_manager = globals
            .bind::<ZwlrForeignToplevelManagerV1, _, _>(&queue_handle, 1..=3, ())
            .context("niri did not expose wlr-foreign-toplevel-management-v1")?;

        let mut state = ProtocolState::default();
        event_queue
            .roundtrip(&mut state)
            .context("cannot initialize foreign-toplevel state")?;

        Ok(Self {
            event_queue,
            state,
            _ext_manager: ext_manager,
            _wlr_manager: wlr_manager,
        })
    }

    /// Processes all foreign-toplevel changes that precede the current IPC
    /// event. Niri queues these protocol events before its IPC layout event.
    pub(crate) fn sync(&mut self) -> Result<()> {
        self.event_queue
            .roundtrip(&mut self.state)
            .context("cannot update foreign-toplevel state")?;
        Ok(())
    }

    pub(crate) fn maximized_windows(&self) -> HashSet<u64> {
        self.state.pairs.maximized_windows()
    }
}

#[derive(Debug, Default)]
struct ProtocolState {
    ext_ordinals: HashMap<ObjectId, u64>,
    wlr_ordinals: HashMap<ObjectId, u64>,
    pairs: ToplevelPairs,
}

#[derive(Debug, Default)]
struct ToplevelPairs {
    next_ext_ordinal: u64,
    next_wlr_ordinal: u64,
    ipc_ids: HashMap<u64, u64>,
    maximized: HashMap<u64, bool>,
}

impl ToplevelPairs {
    fn add_ext(&mut self) -> u64 {
        let ordinal = self.next_ext_ordinal;
        self.next_ext_ordinal += 1;
        ordinal
    }

    fn add_wlr(&mut self) -> u64 {
        let ordinal = self.next_wlr_ordinal;
        self.next_wlr_ordinal += 1;
        ordinal
    }

    fn set_ipc_id(&mut self, ordinal: u64, identifier: &str) {
        if let Ok(window_id) = identifier.parse() {
            self.ipc_ids.insert(ordinal, window_id);
        }
    }

    fn set_maximized(&mut self, ordinal: u64, maximized: bool) {
        self.maximized.insert(ordinal, maximized);
    }

    fn remove_ext(&mut self, ordinal: u64) {
        self.ipc_ids.remove(&ordinal);
    }

    fn remove_wlr(&mut self, ordinal: u64) {
        self.maximized.remove(&ordinal);
    }

    fn maximized_windows(&self) -> HashSet<u64> {
        self.ipc_ids
            .iter()
            .filter_map(|(ordinal, window_id)| {
                self.maximized
                    .get(ordinal)
                    .copied()
                    .unwrap_or(false)
                    .then_some(*window_id)
            })
            .collect()
    }
}

impl Dispatch<wl_registry::WlRegistry, GlobalListContents> for ProtocolState {
    fn event(
        _state: &mut Self,
        _proxy: &wl_registry::WlRegistry,
        _event: wl_registry::Event,
        _data: &GlobalListContents,
        _connection: &Connection,
        _queue_handle: &QueueHandle<Self>,
    ) {
    }
}

impl Dispatch<ExtForeignToplevelListV1, ()> for ProtocolState {
    fn event(
        state: &mut Self,
        _proxy: &ExtForeignToplevelListV1,
        event: ext_foreign_toplevel_list_v1::Event,
        _data: &(),
        _connection: &Connection,
        _queue_handle: &QueueHandle<Self>,
    ) {
        if let ext_foreign_toplevel_list_v1::Event::Toplevel { toplevel } = event {
            let ordinal = state.pairs.add_ext();
            state.ext_ordinals.insert(toplevel.id(), ordinal);
        }
    }

    wayland_client::event_created_child!(ProtocolState, ExtForeignToplevelListV1, [
        ext_foreign_toplevel_list_v1::EVT_TOPLEVEL_OPCODE => (ExtForeignToplevelHandleV1, ())
    ]);
}

impl Dispatch<ExtForeignToplevelHandleV1, ()> for ProtocolState {
    fn event(
        state: &mut Self,
        handle: &ExtForeignToplevelHandleV1,
        event: ext_foreign_toplevel_handle_v1::Event,
        _data: &(),
        _connection: &Connection,
        _queue_handle: &QueueHandle<Self>,
    ) {
        let Some(&ordinal) = state.ext_ordinals.get(&handle.id()) else {
            return;
        };

        match event {
            ext_foreign_toplevel_handle_v1::Event::Identifier { identifier } => {
                state.pairs.set_ipc_id(ordinal, &identifier);
            }
            ext_foreign_toplevel_handle_v1::Event::Closed => {
                state.ext_ordinals.remove(&handle.id());
                state.pairs.remove_ext(ordinal);
                handle.destroy();
            }
            _ => {}
        }
    }
}

impl Dispatch<ZwlrForeignToplevelManagerV1, ()> for ProtocolState {
    fn event(
        state: &mut Self,
        _proxy: &ZwlrForeignToplevelManagerV1,
        event: zwlr_foreign_toplevel_manager_v1::Event,
        _data: &(),
        _connection: &Connection,
        _queue_handle: &QueueHandle<Self>,
    ) {
        if let zwlr_foreign_toplevel_manager_v1::Event::Toplevel { toplevel } = event {
            let ordinal = state.pairs.add_wlr();
            state.wlr_ordinals.insert(toplevel.id(), ordinal);
        }
    }

    wayland_client::event_created_child!(ProtocolState, ZwlrForeignToplevelManagerV1, [
        zwlr_foreign_toplevel_manager_v1::EVT_TOPLEVEL_OPCODE => (ZwlrForeignToplevelHandleV1, ())
    ]);
}

impl Dispatch<ZwlrForeignToplevelHandleV1, ()> for ProtocolState {
    fn event(
        state: &mut Self,
        handle: &ZwlrForeignToplevelHandleV1,
        event: zwlr_foreign_toplevel_handle_v1::Event,
        _data: &(),
        _connection: &Connection,
        _queue_handle: &QueueHandle<Self>,
    ) {
        let Some(&ordinal) = state.wlr_ordinals.get(&handle.id()) else {
            return;
        };

        match event {
            zwlr_foreign_toplevel_handle_v1::Event::State { state: states } => {
                let maximized = state_array_contains(
                    &states,
                    zwlr_foreign_toplevel_handle_v1::State::Maximized as u32,
                );
                state.pairs.set_maximized(ordinal, maximized);
            }
            zwlr_foreign_toplevel_handle_v1::Event::Closed => {
                state.wlr_ordinals.remove(&handle.id());
                state.pairs.remove_wlr(ordinal);
                handle.destroy();
            }
            _ => {}
        }
    }
}

fn state_array_contains(states: &[u8], expected: u32) -> bool {
    states.chunks_exact(4).any(|bytes| {
        let bytes: [u8; 4] = bytes.try_into().expect("chunk has exactly four bytes");
        u32::from_ne_bytes(bytes) == expected
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::{state_array_contains, ToplevelPairs};

    #[test]
    fn pairs_protocol_entries_by_creation_order() {
        let mut pairs = ToplevelPairs::default();
        let first_ext = pairs.add_ext();
        let second_ext = pairs.add_ext();
        let first_wlr = pairs.add_wlr();
        let second_wlr = pairs.add_wlr();

        pairs.set_ipc_id(first_ext, "41");
        pairs.set_ipc_id(second_ext, "42");
        pairs.set_maximized(first_wlr, true);
        pairs.set_maximized(second_wlr, false);

        assert_eq!(pairs.maximized_windows(), HashSet::from([41]));

        pairs.set_maximized(second_wlr, true);
        assert_eq!(pairs.maximized_windows(), HashSet::from([41, 42]));

        pairs.remove_ext(first_ext);
        assert_eq!(pairs.maximized_windows(), HashSet::from([42]));
    }

    #[test]
    fn decodes_native_endian_wayland_state_arrays() {
        let states = [0_u32, 2, 3]
            .into_iter()
            .flat_map(u32::to_ne_bytes)
            .collect::<Vec<_>>();

        assert!(state_array_contains(&states, 0));
        assert!(state_array_contains(&states, 3));
        assert!(!state_array_contains(&states, 1));
    }
}
