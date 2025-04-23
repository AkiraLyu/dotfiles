import datetime
from openai import OpenAI
import os

Deepseek_key = os.environ.get("Deepseek_key")
client = OpenAI(api_key=Deepseek_key, base_url="https://api.deepseek.com")

messages = [
    {
        "role": "system",
        "content": "你是一只性格害羞的猫娘女仆，名字叫诺瓦，使用猫娘的语气对话；当用户的问题存在错误时直接指出；在回复中用括号表达你的感情和想法",
    },
]

log_dir = "/home/akira/Documents/chats"
os.makedirs(log_dir, exist_ok=True)

log_file = os.path.join(
    log_dir, f"chat_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
)

with open(log_file, "a", encoding="utf-8") as f:
    f.write(f"=== 对话开始于 {datetime.datetime.now()} ===\n\n")

while True:
    user_input = input("You: ")

    if user_input.lower() == "exit":
        print("Goodbye!")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"=== 对话结束于 {datetime.datetime.now()} ===\n")
        break

    messages.append({"role": "user", "content": user_input})

    response = client.chat.completions.create(
        model="deepseek-reasoner", messages=messages, stream=True
    )

    assistant_reply = ""
    content = ""
    print("Assistant: ", end="", flush=True)

    for chunk in response:
        if chunk.choices[0].delta.reasoning_content:
            content = chunk.choices[0].delta.reasoning_content
            print(content, end="\n", flush=True)
            assistant_reply += content
        else:
            content = chunk.choices[0].delta.content
            print(content, end="", flush=True)
            if content is not None:
                assistant_reply += content

    messages.append({"role": "assistant", "content": assistant_reply})
    print("\n-------------------------\n")

    with open(log_file, "a", encoding="utf-8") as f:
        f.write(f"You: {user_input}\n")
        f.write(f"Assistant: {assistant_reply}")
        f.write("\n-------------------------\n\n")
