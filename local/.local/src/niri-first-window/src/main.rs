#![forbid(unsafe_code)]

mod config_rules;
mod engine;
mod foreign_toplevel;

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use clap::Parser;
use config_rules::{config_path, RuleSet};
use engine::{Engine, Operation};
use foreign_toplevel::MaximizedState;
use niri_ipc::socket::Socket;
use niri_ipc::{Action, Event, Reply, Request, Response, SizeChange};

#[derive(Debug, Parser)]
#[command(version, about)]
struct Args {
    /// Width of the first window while it is floating, in logical pixels.
    #[arg(value_name = "WIDTH", value_parser = clap::value_parser!(i32).range(1..))]
    width: i32,

    /// Height of the first window while it is floating, in logical pixels.
    #[arg(value_name = "HEIGHT", value_parser = clap::value_parser!(i32).range(1..))]
    height: i32,

    /// Print maximized-state snapshots and policy actions to stderr.
    #[arg(short, long)]
    verbose: bool,

    /// Path to niri's config; defaults to NIRI_CONFIG or the standard user path.
    #[arg(long, value_name = "PATH")]
    config: Option<PathBuf>,
}

fn main() {
    if let Err(error) = run(Args::parse()) {
        eprintln!("niri-first-window: {error:#}");
        std::process::exit(1);
    }
}

fn run(args: Args) -> Result<()> {
    let config_path = config_path(args.config.clone())?;
    let rules = RuleSet::load(&config_path)
        .with_context(|| format!("cannot load window rules from {}", config_path.display()))?;

    let mut event_socket = Socket::connect().context(
        "cannot connect to niri; start this program from niri so NIRI_SOCKET is available",
    )?;
    let mut action_socket = Socket::connect().context("cannot open the niri action connection")?;
    let mut maximized_state = MaximizedState::connect()?;

    match event_socket
        .send(Request::EventStream)
        .context("cannot request niri's event stream")?
    {
        Ok(Response::Handled) => {}
        Ok(response) => bail!("niri returned an unexpected event-stream response: {response:?}"),
        Err(message) => bail!("niri rejected the event-stream request: {message}"),
    }

    let mut engine = Engine::new(args.width, args.height);
    engine.replace_rules(rules);
    update_maximized_windows(&mut engine, &maximized_state, args.verbose);
    let mut read_event = event_socket.read_events();

    loop {
        let event = read_event().context("niri event stream ended")?;
        if matches!(&event, Event::WindowOpenedOrChanged { .. }) {
            maximized_state.sync()?;
            update_maximized_windows(&mut engine, &maximized_state, args.verbose);
        }
        if matches!(&event, Event::ConfigLoaded { failed: false }) {
            match RuleSet::load(&config_path) {
                Ok(rules) => engine.replace_rules(rules),
                Err(error) => eprintln!(
                    "niri-first-window: cannot reload rules from {}: {error:#}",
                    config_path.display()
                ),
            }
        }
        for operation in engine.handle_event(event) {
            if args.verbose {
                eprintln!("niri-first-window: {operation:?}");
            }

            // A window may close between its event and these requests. Niri's
            // ID-targeted actions are safe in that case, so keep the daemon
            // alive if an individual action is rejected.
            if let Err(error) = execute_operation(&mut action_socket, operation) {
                eprintln!("niri-first-window: action failed: {error:#}");
            }
        }
    }
}

fn update_maximized_windows(engine: &mut Engine, state: &MaximizedState, verbose: bool) {
    let windows = state.maximized_windows();
    if verbose {
        let mut ids = windows.iter().copied().collect::<Vec<_>>();
        ids.sort_unstable();
        eprintln!("niri-first-window: maximized windows {ids:?}");
    }
    engine.replace_maximized_windows(windows);
}

fn execute_operation(socket: &mut Socket, operation: Operation) -> Result<()> {
    match operation {
        Operation::FloatResizeAndCenter {
            window_id,
            width,
            height,
        } => {
            send_action(
                socket,
                Action::MoveWindowToFloating {
                    id: Some(window_id),
                },
            )?;
            send_action(
                socket,
                Action::SetWindowWidth {
                    id: Some(window_id),
                    change: SizeChange::SetFixed(width),
                },
            )?;
            send_action(
                socket,
                Action::SetWindowHeight {
                    id: Some(window_id),
                    change: SizeChange::SetFixed(height),
                },
            )?;
            // Center after requesting the final size so niri positions the
            // complete decorated window, rather than only its pre-resize tile.
            send_action(
                socket,
                Action::CenterWindow {
                    id: Some(window_id),
                },
            )?;
        }
        Operation::FloatAndCenter { window_id } => {
            send_action(
                socket,
                Action::MoveWindowToFloating {
                    id: Some(window_id),
                },
            )?;
            send_action(
                socket,
                Action::CenterWindow {
                    id: Some(window_id),
                },
            )?;
        }
        Operation::Center { window_id } => {
            send_action(
                socket,
                Action::CenterWindow {
                    id: Some(window_id),
                },
            )?;
        }
        Operation::TileAndRestore {
            window_id,
            width,
            height,
        } => {
            send_action(
                socket,
                Action::MoveWindowToTiling {
                    id: Some(window_id),
                },
            )?;
            send_action(
                socket,
                Action::SetWindowWidth {
                    id: Some(window_id),
                    change: SizeChange::SetFixed(width),
                },
            )?;
            send_action(
                socket,
                Action::SetWindowHeight {
                    id: Some(window_id),
                    change: SizeChange::SetFixed(height),
                },
            )?;
        }
    }

    Ok(())
}

fn send_action(socket: &mut Socket, action: Action) -> Result<()> {
    let reply = socket
        .send(Request::Action(action))
        .context("cannot send action to niri")?;
    expect_handled(reply)
}

fn expect_handled(reply: Reply) -> Result<()> {
    match reply {
        Ok(Response::Handled) => Ok(()),
        Ok(response) => bail!("unexpected niri action response: {response:?}"),
        Err(message) => bail!("niri rejected the action: {message}"),
    }
}
