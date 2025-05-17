use std::{env, fs, process};

fn main() {
    let args: Vec<String> = env::args().collect();

    // 检查参数数量是否正确
    if args.len() != 3 {
        eprintln!("用法: {} <文件1> <文件2>", args[0]);
        process::exit(1);
    }

    let file_a = &args[1];
    let file_b = &args[2];

    // 读取文件内容，支持二进制文件
    let content_a = fs::read(file_a).unwrap_or_else(|_| {
        eprintln!("错误：无法读取文件 '{}'", file_a);
        process::exit(1);
    });

    let content_b = fs::read(file_b).unwrap_or_else(|_| {
        eprintln!("错误：无法读取文件 '{}'", file_b);
        process::exit(1);
    });

    // 交换写入内容
    fs::write(file_b, &content_a).unwrap_or_else(|_| {
        eprintln!("错误：无法写入文件 '{}'", file_b);
        process::exit(1);
    });

    fs::write(file_a, &content_b).unwrap_or_else(|_| {
        eprintln!("错误：无法写入文件 '{}'", file_a);
        process::exit(1);
    });

    println!("成功交换文件内容！");
}
