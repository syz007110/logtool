#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSV故障码表比较工具
比较两个CSV格式的故障码表，以subsystem+code作为唯一故障编码
比较字段：subsystem, code, short_message, user_hint, operation
"""

import csv
import sys
import os
import argparse
from datetime import datetime
from collections import defaultdict


class CSVErrorCodesComparator:
    def __init__(self):
        # 需要比较的字段
        self.compare_fields = ['subsystem', 'code', 'short_message', 'user_hint', 'operation']
        
        # 故障编码组合字段
        self.key_fields = ['subsystem', 'code']
    
    def load_csv(self, csv_file_path):
        """加载CSV文件并返回故障码数据"""
        try:
            error_codes = {}
            
            with open(csv_file_path, 'r', encoding='utf-8-sig') as csvfile:
                reader = csv.DictReader(csvfile)
                
                for row in reader:
                    # 构建故障编码 (subsystem + 标准化的code)
                    normalized_code = self.normalize_error_code(row.get('code', ''))
                    fault_code = f"{row.get('subsystem', '')}_{normalized_code}"
                    
                    if fault_code in error_codes:
                        print(f"⚠️  警告: 发现重复的故障编码: {fault_code}")
                    
                    error_codes[fault_code] = row
            
            print(f"✅ 成功加载 {len(error_codes)} 条故障码记录: {csv_file_path}")
            return error_codes
            
        except FileNotFoundError:
            print(f"❌ 错误: 文件未找到: {csv_file_path}")
            return None
        except Exception as e:
            print(f"❌ 错误: 读取CSV文件失败: {e}")
            return None
    
    def compare_record_fields(self, record1, record2, fault_code):
        """比较两个记录的指定字段"""
        differences = []
        
        for field in self.compare_fields:
            value1 = record1.get(field, '').strip()
            value2 = record2.get(field, '').strip()
            
            # 对于code字段，忽略0x和0X前缀的大小写差异
            if field == 'code':
                # 标准化故障码格式：统一转换为大写
                normalized_value1 = self.normalize_error_code(value1)
                normalized_value2 = self.normalize_error_code(value2)
                
                if normalized_value1 != normalized_value2:
                    differences.append({
                        'field': field,
                        'file1_value': value1,
                        'file2_value': value2
                    })
            else:
                if value1 != value2:
                    differences.append({
                        'field': field,
                        'file1_value': value1,
                        'file2_value': value2
                    })
        
        return differences
    
    def normalize_error_code(self, code):
        """标准化故障码格式，忽略0x/0X前缀的大小写差异"""
        if not code:
            return ''
        
        # 统一转换为大写，这样0x和0X就变成相同的0X
        return code.upper()
    
    def compare_csv_files(self, csv1_path, csv2_path):
        """比较两个CSV文件"""
        print(f"🔍 开始比较CSV文件...")
        print(f"📁 文件1: {csv1_path}")
        print(f"📁 文件2: {csv2_path}")
        print()
        
        # 加载两个CSV文件
        error_codes1 = self.load_csv(csv1_path)
        error_codes2 = self.load_csv(csv2_path)
        
        if error_codes1 is None or error_codes2 is None:
            return False
        
        # 获取所有故障编码
        all_fault_codes = set(error_codes1.keys()) | set(error_codes2.keys())
        
        # 比较结果统计
        results = {
            'identical': [],      # 完全一致
            'different': [],       # 有差异
            'only_in_file1': [],  # 仅在文件1中
            'only_in_file2': [],  # 仅在文件2中
            'total_file1': len(error_codes1),
            'total_file2': len(error_codes2),
            'total_compared': 0
        }
        
        print(f"📊 统计信息:")
        print(f"   文件1故障码数量: {results['total_file1']}")
        print(f"   文件2故障码数量: {results['total_file2']}")
        print(f"   唯一故障编码总数: {len(all_fault_codes)}")
        print()
        
        # 逐个比较故障编码
        for fault_code in sorted(all_fault_codes):
            if fault_code in error_codes1 and fault_code in error_codes2:
                # 两个文件都有此故障编码，进行比较
                record1 = error_codes1[fault_code]
                record2 = error_codes2[fault_code]
                
                differences = self.compare_record_fields(record1, record2, fault_code)
                
                if not differences:
                    # 完全一致
                    results['identical'].append(fault_code)
                else:
                    # 有差异
                    results['different'].append({
                        'fault_code': fault_code,
                        'differences': differences
                    })
                
                results['total_compared'] += 1
                
            elif fault_code in error_codes1:
                # 仅在文件1中
                results['only_in_file1'].append(fault_code)
            else:
                # 仅在文件2中
                results['only_in_file2'].append(fault_code)
        
        # 输出比较结果
        self.print_comparison_results(results)
        
        return results
    
    def print_comparison_results(self, results):
        """打印比较结果"""
        print("=" * 80)
        print("📋 比较结果汇总")
        print("=" * 80)
        
        # 基本统计
        print(f"✅ 完全一致的故障编码: {len(results['identical'])}")
        print(f"❌ 存在差异的故障编码: {len(results['different'])}")
        print(f"📄 仅在文件1中的故障编码: {len(results['only_in_file1'])}")
        print(f"📄 仅在文件2中的故障编码: {len(results['only_in_file2'])}")
        print()
        
        # 详细差异报告
        if results['different']:
            print("🔍 详细差异报告:")
            print("-" * 80)
            
            for item in results['different']:
                fault_code = item['fault_code']
                differences = item['differences']
                
                print(f"故障编码: {fault_code}")
                for diff in differences:
                    field = diff['field']
                    value1 = diff['file1_value']
                    value2 = diff['file2_value']
                    
                    print(f"  📝 {field}:")
                    print(f"     文件1: '{value1}'")
                    print(f"     文件2: '{value2}'")
                print()
        
        # 仅在某个文件中的故障编码
        if results['only_in_file1']:
            print("📄 仅在文件1中的故障编码:")
            for fault_code in results['only_in_file1'][:10]:  # 只显示前10个
                print(f"  - {fault_code}")
            if len(results['only_in_file1']) > 10:
                print(f"  ... 还有 {len(results['only_in_file1']) - 10} 个")
            print()
        
        if results['only_in_file2']:
            print("📄 仅在文件2中的故障编码:")
            for fault_code in results['only_in_file2'][:10]:  # 只显示前10个
                print(f"  - {fault_code}")
            if len(results['only_in_file2']) > 10:
                print(f"  ... 还有 {len(results['only_in_file2']) - 10} 个")
            print()
        
        # 一致性百分比
        if results['total_compared'] > 0:
            identical_percentage = (len(results['identical']) / results['total_compared']) * 100
            print(f"📊 一致性: {identical_percentage:.1f}% ({len(results['identical'])}/{results['total_compared']})")
        
        print("=" * 80)
    
    def export_differences_report(self, results, output_file, error_codes1, error_codes2):
        """导出差异报告到CSV文件"""
        try:
            with open(output_file, 'w', newline='', encoding='utf-8-sig') as csvfile:
                # 定义CSV字段
                fieldnames = [
                    'fault_code', 'status', 'subsystem', 'code', 
                    'short_message_file1', 'short_message_file2',
                    'user_hint_file1', 'user_hint_file2',
                    'operation_file1', 'operation_file2'
                ]
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                writer.writeheader()
                
                # 写入有差异的记录
                for item in results['different']:
                    fault_code = item['fault_code']
                    record1 = error_codes1.get(fault_code, {})
                    record2 = error_codes2.get(fault_code, {})
                    
                    # 检查哪些字段有差异
                    short_msg_diff = record1.get('short_message', '') != record2.get('short_message', '')
                    user_hint_diff = record1.get('user_hint', '') != record2.get('user_hint', '')
                    operation_diff = record1.get('operation', '') != record2.get('operation', '')
                    
                    writer.writerow({
                        'fault_code': fault_code,
                        'status': 'different',
                        'subsystem': record1.get('subsystem', ''),
                        'code': record1.get('code', ''),
                        'short_message_file1': record1.get('short_message', ''),
                        'short_message_file2': record2.get('short_message', ''),
                        'user_hint_file1': record1.get('user_hint', ''),
                        'user_hint_file2': record2.get('user_hint', ''),
                        'operation_file1': record1.get('operation', ''),
                        'operation_file2': record2.get('operation', '')
                    })
                
                # 写入仅在文件1中的记录
                for fault_code in results['only_in_file1']:
                    record = error_codes1.get(fault_code, {})
                    writer.writerow({
                        'fault_code': fault_code,
                        'status': 'only_in_file1',
                        'subsystem': record.get('subsystem', ''),
                        'code': record.get('code', ''),
                        'short_message_file1': record.get('short_message', ''),
                        'short_message_file2': '',
                        'user_hint_file1': record.get('user_hint', ''),
                        'user_hint_file2': '',
                        'operation_file1': record.get('operation', ''),
                        'operation_file2': ''
                    })
                
                # 写入仅在文件2中的记录
                for fault_code in results['only_in_file2']:
                    record = error_codes2.get(fault_code, {})
                    writer.writerow({
                        'fault_code': fault_code,
                        'status': 'only_in_file2',
                        'subsystem': record.get('subsystem', ''),
                        'code': record.get('code', ''),
                        'short_message_file1': '',
                        'short_message_file2': record.get('short_message', ''),
                        'user_hint_file1': '',
                        'user_hint_file2': record.get('user_hint', ''),
                        'operation_file1': '',
                        'operation_file2': record.get('operation', '')
                    })
            
            print(f"📄 差异报告已导出到: {output_file}")
            return True
            
        except Exception as e:
            print(f"❌ 导出差异报告失败: {e}")
            return False


def main():
    parser = argparse.ArgumentParser(description='CSV故障码表比较工具')
    parser.add_argument('csv1', help='第一个CSV文件路径')
    parser.add_argument('csv2', help='第二个CSV文件路径')
    parser.add_argument('-o', '--output', help='差异报告输出文件路径（可选）')
    parser.add_argument('-v', '--verbose', action='store_true', help='显示详细信息')
    
    args = parser.parse_args()
    
    # 检查输入文件是否存在
    if not os.path.exists(args.csv1):
        print(f"❌ 错误: 第一个CSV文件不存在: {args.csv1}")
        sys.exit(1)
    
    if not os.path.exists(args.csv2):
        print(f"❌ 错误: 第二个CSV文件不存在: {args.csv2}")
        sys.exit(1)
    
    # 创建比较器
    comparator = CSVErrorCodesComparator()
    
    # 执行比较
    results = comparator.compare_csv_files(args.csv1, args.csv2)
    
    if results:
        print("✅ 比较完成!")
        
        # 如果指定了输出文件，导出差异报告
        if args.output:
            # 重新加载数据以获取完整记录
            error_codes1 = comparator.load_csv(args.csv1)
            error_codes2 = comparator.load_csv(args.csv2)
            
            if error_codes1 and error_codes2:
                success = comparator.export_differences_report(results, args.output, error_codes1, error_codes2)
                if success:
                    print(f"📄 差异报告已保存到: {args.output}")
                else:
                    print("❌ 导出差异报告失败!")
            else:
                print("❌ 无法加载CSV文件进行导出!")
        
        sys.exit(0)
    else:
        print("❌ 比较失败!")
        sys.exit(1)


if __name__ == "__main__":
    main()
