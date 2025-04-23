# 批量下载网站markdown中的图片
import requests
import os
import re

def download_image(url, save_path):
    response = requests.get(url)
    if response.status_code == 200:
        with open(save_path, 'wb') as file:
            file.write(response.content)
        print(f"Image downloaded successfully to {save_path}")
    else:
        print(f"Failed to download image from {url}")

def main():
    # 读取 Markdown 文件
    with open("STM32F1学习笔记.md", "r") as file:
        content = file.read()

    # 匹配外链图片链接
    image_urls = re.findall(r"!\[.*?\]\((.*?)\)", content)

    # 本地保存文件夹路径
    save_folder = "downloaded_images"
    if not os.path.exists(save_folder):
        os.makedirs(save_folder)

    for url in image_urls:
        download_image(url, os.path.join(save_folder, os.path.basename(url)))

if __name__ == "__main__":
    main()
