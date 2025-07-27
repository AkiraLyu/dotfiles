use std::env;
use std::fs::write;
use std::io::{self, Read};
use std::path::PathBuf;
use std::process::Command;
fn main() {
    kill(); // 停止现有壁纸进程

    // 获取壁纸路径，优先顺序：参数 > stdin > zenity
    let path = get_wallpaper_path();

    set_wallpaper(path);
}

fn get_wallpaper_path() -> String {
    let mut args = std::env::args().skip(1); // 跳过程序名
    if let Some(arg) = args.next() {
        return arg;
    }

    // 检查是否有标准输入内容
    let mut buffer = String::new();
    if atty::isnt(atty::Stream::Stdin) && io::stdin().read_to_string(&mut buffer).is_ok() {
        let trimmed = buffer.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    // 否则 fallback 到 Zenity
    find_wallpaper()
}

fn find_wallpaper() -> String {
    let output = Command::new("zenity")
        .arg("--file-selection")
        .arg("--filename=/home/akira/Pictures/")
        .output()
        .expect("Failed to open file selection");

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    path
}

fn set_wallpaper(path: String) {
    let result = if path.ends_with(".mp4") {
        Command::new("/home/akira/.local/scripts/set-wallpaper.sh")
            .arg(&path)
            .spawn()
    } else {
        Command::new("swaybg")
            .args(["-i", &path, "-m", "fill"])
            .spawn()
    };

    if let Err(e) = result {
        eprintln!("Failed to set wallpaper for '{}': {}", path, e);
    }

    let desktop = match env::var("DESKTOP_SESSION").as_deref() {
        Ok("hyprland") => "hypr",
        Ok("niri") => "niri",
        _ => "sway",
    };

    // 构造路径
    let mut config_path = PathBuf::from("/home/akira/.config");
    config_path.push(desktop);
    config_path.push("scripts");
    config_path.push("wallpaper.txt");

    println!("Wallpaper path: {}", path);

    if let Err(e) = write(&config_path, path) {
        eprintln!("Failed to write wallpaper path to {:?}: {}", config_path, e);
    }
}

fn kill() {
    kill_process("swaybg");
    kill_process("mpvpaper");
}

fn kill_process(process_name: &str) {
    let mut command = Command::new("pkill")
        .arg(process_name)
        .spawn()
        .unwrap_or_else(|_| panic!("Failed to kill {}", process_name));
    command.wait().expect("Failed to wait on pkill command");
}
