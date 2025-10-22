import os
import csv
import tkinter as tk
from tkinter import filedialog, messagebox
from ctypes import Structure, c_float, c_int, c_uint, c_ulonglong, c_bool,c_short, sizeof


# 定义结构体
class MotionData(Structure):
    _fields_ = [
        ('ulint_data', c_ulonglong),       # 8 bytes
        ('real_data', c_float * 183),      # 732 bytes
        ('dint_data', c_int),              # 4 bytes
        ('uint_data', c_uint),             # 4 bytes
        ('bool_data', c_bool * 8),          # 8 bytes
        ('instType', c_short*4),            # 2*4 bytes
        ('instUDI', c_uint * 16)            # 4*16 bytes
    ]

import json


# 3. 从 JSON 配置文件加载表头信息
def load_header_config(config_path='title.json'):
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)
    
# 解析文件，返回数据列表
def parse_motion_file(file_path):
    results = []
    entry_size = sizeof(MotionData)

    with open(file_path, 'rb') as f:
        content = f.read()
        total_entries = len(content) // entry_size

        for i in range(total_entries):
            chunk = content[i*entry_size : (i+1)*entry_size]
            motion = MotionData.from_buffer_copy(chunk)

            # 提取部分字段写入结果
            result = {
                'ulint_data': motion.ulint_data,
            }

            # 提取 real_data 前 5 项，可改为全部
            for j in range(183):
                result[f'real_data_{j}'] = motion.real_data[j]

            result[f'dint_data'] = (motion.dint_data)  # runningState
            result[f'uint_data'] = (motion.uint_data)  # errorcode
            # 提取 bool_data
            for k in range(8):
                result[f'bool_data_{k}'] = int(motion.bool_data[k])  # 转成 0/1
            # 提取 insttype
            for a in range(4):
                result[f'instType_{a}'] = int(motion.instType[a])  # 器械

            for armindex in range(16):
                result[f'instUDI_{armindex}'] = int(motion.instUDI[armindex])

            results.append(result)
    
    return results


# 输出到 CSV 文件
def export_to_csv(data, output_path, config_list):
    if not data:
        return
    fieldnames = [item['index'] for item in config_list]
    headers = [item['name'] for item in config_list]
    keys = data[0].keys()
    with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(headers)

        for row in data:
            writer.writerow([row.get(key, '') for key in fieldnames])


# GUI 文件选择 + 调用解析
def select_file_and_parse():
    file_path = filedialog.askopenfilename(
        title="选择二进制文件",
        filetypes=[("Binary files", "*.bin"), ("All files", "*.*")]
    )
    if not file_path:
        return

    try:
        result = parse_motion_file(file_path)
        config = load_header_config('title.json')
    except Exception as e:
        messagebox.showerror("解析失败", f"文件读取或解析出错：\n{str(e)}")
        return

    if not result:
        messagebox.showwarning("无数据", "未能从文件中解析到 MotionData 数据。")
        return

    # 选择 CSV 输出路径
    output_path = filedialog.asksaveasfilename(
        defaultextension=".csv",
        filetypes=[("CSV files", "*.csv")],
        title="保存解析结果"
    )
    if not output_path:
        return

    export_to_csv(result, output_path,config)
    messagebox.showinfo("成功", f"解析完成，共导出 {len(result)} 条记录。\n文件已保存至:\n{output_path}")


# 创建简单窗口
def launch_gui():
    root = tk.Tk()
    root.title("MotionData 解析工具 v2")
    root.geometry("400x160")

    label = tk.Label(root, text="选择要解析的二进制文件 (.bin)", font=("Arial", 12))
    label.pack(pady=20)

    button = tk.Button(root, text="选择并解析文件", command=select_file_and_parse,
                       font=("Arial", 12), bg="#4CAF50", fg="white")
    button.pack(pady=10)

    root.mainloop()


if __name__ == "__main__":
    launch_gui()
