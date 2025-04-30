use std::env;
use std::fs::{self, File};
use std::io::{self, BufRead, Write};
use std::path::Path;
use std::process::Command;

fn main() -> io::Result<()> {
    // 获取命令行参数
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("用法: {} <操作模式: divide|direct> [输入文件路径]", args[0]);
        eprintln!("未提供输入文件路径，将调用 zenity 选择文件...");
    }

    // 确定操作模式
    let mode = args.get(1).expect("需要指定操作模式: divide 或 direct");
    let input_file = args.get(2).map(String::from).unwrap_or_else(|| {
        let output = Command::new("zenity")
            .arg("--file-selection")
            .arg("--title=选择输入文件")
            .output()
            .expect("调用 zenity 失败");
        String::from_utf8(output.stdout)
            .expect("无法解析 zenity 输出")
            .trim()
            .to_string()
    });

    if input_file.is_empty() {
        eprintln!("未选择文件，程序退出。");
        return Ok(());
    }

    // 根据模式执行相应操作
    match mode.as_str() {
        "divide" => divide_to_files(&input_file),
        "direct" => direct_to_one_file(&input_file),
        _ => {
            eprintln!("未知操作模式: {}，仅支持 divide 和 direct", mode);
            Ok(())
        }
    }
}

/// 将内容按段拆分为多个文件
fn divide_to_files(input_file: &str) -> io::Result<()> {
    let output_dir = "output"; // 输出目录
    fs::create_dir_all(output_dir)?;

    let file = File::open(input_file)?;
    let reader = io::BufReader::new(file);

    let mut current_date = String::new();
    let mut current_metadata = String::new();
    let mut current_content = String::new();

    for line in reader.lines() {
        let line = line?;
        if line.starts_with("2022") || line.starts_with("2024") || line.starts_with("2023") || line.starts_with("2025") {
            if !current_date.is_empty() && !current_content.is_empty() {
                save_to_file(
                    &current_date,
                    &current_metadata,
                    &current_content,
                    output_dir,
                )?;
                current_date.clear();
                current_metadata.clear();
                current_content.clear();
            }

            if let Some((date, rest)) = line.split_once(' ') {
                current_date = date.replace("年", "-").replace("月", "-").replace("日", "");
                current_metadata = rest.trim().to_string();
            }
        } else {
            current_content.push_str(&line);
            current_content.push('\n');
        }
    }

    if !current_date.is_empty() && !current_content.is_empty() {
        save_to_file(
            &current_date,
            &current_metadata,
            &current_content,
            output_dir,
        )?;
    }

    println!(
        "文本拆分完成，生成的 Markdown 文件保存在目录: {}",
        output_dir
    );
    Ok(())
}

/// 保存段落到 Markdown 文件
fn save_to_file(date: &str, metadata: &str, content: &str, output_dir: &str) -> io::Result<()> {
    let file_path = Path::new(output_dir).join(format!("{}.md", date));
    let mut file = File::create(file_path)?;

    writeln!(file, "{}", metadata)?;
    writeln!(file, "{}", content)?;

    Ok(())
}

/// 将内容直接生成一个文件
fn direct_to_one_file(input_file: &str) -> io::Result<()> {
    let output_file = "diary.md";
    let file = File::open(input_file)?;
    let reader = io::BufReader::new(file);

    let mut output = File::create(output_file)?;

    for line in reader.lines() {
        let mut line = line?;

        if line.starts_with("2022") || line.starts_with("2024") || line.starts_with("2023") || line.starts_with("2025") {
            line.insert_str(0, "## ");
            if let Some(pos) = line.find("日") {
                let space_after_day = pos + '日'.len_utf8();
                let space_end = line[space_after_day..]
                    .char_indices()
                    .take_while(|&(_, c)| c == ' ')
                    .last()
                    .map_or(space_after_day, |(offset, _)| space_after_day + offset + 1);

                line.insert_str(space_end, "\n\n");
            }
        }

        writeln!(output, "{}", line)?;
    }

    println!("文件处理完成，结果保存在: {}", output_file);
    Ok(())
}
