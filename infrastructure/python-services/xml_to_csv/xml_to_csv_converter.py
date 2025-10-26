#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
XML故障码文件转换为CSV格式
支持与多语言管理导出的XML文件格式一致
"""

import xml.etree.ElementTree as ET
import csv
import sys
import os
import argparse
from datetime import datetime


class XMLToCSVConverter:
    def __init__(self):
        # CSV字段定义（与故障码表字段一致）
        self.csv_fields = [
            'id',
            'subsystem', 
            'code',
            'is_axis_error',
            'is_arm_error',
            'short_message',
            'user_hint',
            'operation',
            'detail',
            'method',
            'param1',
            'param2',
            'param3',
            'param4',
            'solution',
            'for_expert',
            'for_novice',
            'related_log',
            'stop_report',
            'level',
            'tech_solution',
            'explanation',
            'category'
        ]
        
        # 子系统映射（从XML的subsystem id到数据库值）
        self.subsystem_mapping = {
            '1': '1',  # 01：运动控制软件
            '2': '2',  # 02：人机交互软件
            '3': '3',  # 03：医生控制台软件
            '4': '4',  # 04：手术台车软件
            '5': '5',  # 05：驱动器软件
            '6': '6',  # 06：图像软件
            '7': '7',  # 07：工具工厂软件
            '8': '8',  # 08：远程运动控制软件
            '9': '9',  # 09：远程医生控制台软件
            '10': 'A'  # 0A：远程驱动器软件
        }
    
    def parse_xml(self, xml_file_path):
        """解析XML文件"""
        try:
            tree = ET.parse(xml_file_path)
            root = tree.getroot()
            return root
        except ET.ParseError as e:
            print(f"XML解析错误: {e}")
            return None
        except FileNotFoundError:
            print(f"文件未找到: {xml_file_path}")
            return None
    
    def extract_error_codes(self, root):
        """从XML根节点提取故障码数据"""
        error_codes = []
        
        # 查找所有子系统
        subsystems = root.findall('.//subsystem')
        
        for subsystem in subsystems:
            subsystem_id = subsystem.get('id')
            # 转换子系统ID
            db_subsystem = self.subsystem_mapping.get(subsystem_id, subsystem_id)
            
            # 查找该子系统下的所有故障码
            error_codes_in_subsystem = subsystem.findall('error_code')
            
            for error_code in error_codes_in_subsystem:
                code_id = error_code.get('id', '')
                
                # 提取各字段数据
                axis = self.get_text_content(error_code, 'axis')
                description = self.get_text_content(error_code, 'description')
                simple = self.get_text_content(error_code, 'simple')
                user_info = self.get_text_content(error_code, 'userInfo')
                op_info = self.get_text_content(error_code, 'opinfo')
                is_arm = self.get_text_content(error_code, 'isArm')
                det_info = self.get_text_content(error_code, 'detInfo')
                method = self.get_text_content(error_code, 'method')
                para1 = self.get_text_content(error_code, 'para1')
                para2 = self.get_text_content(error_code, 'para2')
                para3 = self.get_text_content(error_code, 'para3')
                para4 = self.get_text_content(error_code, 'para4')
                expert = self.get_text_content(error_code, 'expert')
                learner = self.get_text_content(error_code, 'learner')
                log = self.get_text_content(error_code, 'log')
                action = self.get_text_content(error_code, 'action')
                
                # 构建故障码记录
                error_code_data = {
                    'id': '',  # 导入时ID为空，由数据库自动生成
                    'subsystem': db_subsystem,
                    'code': code_id,
                    'is_axis_error': self.boolean_convert(axis),
                    'is_arm_error': self.boolean_convert(is_arm),
                    'short_message': simple,
                    'user_hint': user_info,
                    'operation': op_info,
                    'detail': description or det_info,  # 优先使用description
                    'method': method,
                    'param1': para1,
                    'param2': para2,
                    'param3': para3,
                    'param4': para4,
                    'solution': self.convert_solution(action),
                    'for_expert': self.boolean_convert(expert),
                    'for_novice': self.boolean_convert(learner),
                    'related_log': self.boolean_convert(log),
                    'stop_report': '',  # XML中没有此字段
                    'level': self.analyze_error_level(code_id),
                    'tech_solution': '',  # XML中没有此字段
                    'explanation': '',  # XML中没有此字段
                    'category': self.analyze_error_category(code_id)
                }
                
                error_codes.append(error_code_data)
        
        return error_codes
    
    def get_text_content(self, element, tag_name):
        """安全获取XML元素的文本内容"""
        child = element.find(tag_name)
        if child is not None and child.text:
            return child.text.strip()
        return ''
    
    def boolean_convert(self, value):
        """将XML中的布尔值转换为数据库格式"""
        if value is None:
            return False
        value_str = str(value).strip().lower()
        return value_str in ['true', '1', '1.0', 'yes']
    
    def convert_solution(self, action):
        """转换处理措施"""
        if not action:
            return 'tips'
        
        action_lower = action.lower()
        if 'recoverable' in action_lower:
            return 'recoverable'
        elif 'ignorable' in action_lower:
            return 'ignorable'
        elif 'log' in action_lower:
            return 'log'
        else:
            return 'tips'
    
    def analyze_error_level(self, code):
        """根据故障码分析故障等级"""
        if not code or len(code) < 4:
            return '无'
        
        # 提取故障码末尾字母
        last_char = code[-1].upper()
        
        level_map = {
            'A': '高级',
            'B': '中级', 
            'C': '低级',
            'D': '无',
            'E': '无'
        }
        
        return level_map.get(last_char, '无')
    
    def analyze_error_category(self, code):
        """根据故障码分析故障分类"""
        if not code:
            return '软件'
        
        # 这里可以根据实际业务逻辑进行分类
        # 暂时返回默认分类
        return '软件'
    
    def write_csv(self, error_codes, output_file):
        """将故障码数据写入CSV文件"""
        try:
            with open(output_file, 'w', newline='', encoding='utf-8-sig') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=self.csv_fields)
                
                # 写入表头
                writer.writeheader()
                
                # 写入数据
                for error_code in error_codes:
                    writer.writerow(error_code)
            
            print(f"成功导出 {len(error_codes)} 条故障码记录到: {output_file}")
            return True
            
        except Exception as e:
            print(f"写入CSV文件失败: {e}")
            return False
    
    def convert(self, xml_file_path, output_file_path=None):
        """执行XML到CSV的转换"""
        print(f"开始处理XML文件: {xml_file_path}")
        
        # 解析XML
        root = self.parse_xml(xml_file_path)
        if root is None:
            return False
        
        # 提取故障码数据
        error_codes = self.extract_error_codes(root)
        if not error_codes:
            print("未找到任何故障码数据")
            return False
        
        print(f"找到 {len(error_codes)} 条故障码记录")
        
        # 生成输出文件名
        if output_file_path is None:
            base_name = os.path.splitext(os.path.basename(xml_file_path))[0]
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file_path = f"{base_name}_converted_{timestamp}.csv"
        
        # 写入CSV
        return self.write_csv(error_codes, output_file_path)


def main():
    parser = argparse.ArgumentParser(description='XML故障码文件转换为CSV格式')
    parser.add_argument('xml_file', help='输入的XML文件路径')
    parser.add_argument('-o', '--output', help='输出的CSV文件路径（可选）')
    parser.add_argument('-v', '--verbose', action='store_true', help='显示详细信息')
    
    args = parser.parse_args()
    
    # 检查输入文件是否存在
    if not os.path.exists(args.xml_file):
        print(f"错误: 输入文件不存在: {args.xml_file}")
        sys.exit(1)
    
    # 创建转换器
    converter = XMLToCSVConverter()
    
    # 执行转换
    success = converter.convert(args.xml_file, args.output)
    
    if success:
        print("转换完成!")
        sys.exit(0)
    else:
        print("转换失败!")
        sys.exit(1)


if __name__ == "__main__":
    main()
