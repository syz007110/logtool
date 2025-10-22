from datetime import datetime
import filter
import math


def parse_datetime(date_time_str):
    """解析日期和时间字符串"""
    # 去除前缀 'DT#'
    date_time_str = date_time_str[3:]

    # 定义日期时间的格式
    date_format = '%Y-%m-%d-%H:%M:%S'

    # 将字符串转换为 datetime 对象
    dt = datetime.strptime(date_time_str, date_format)
    return dt

def operate_key(key):
    """
    对密钥进行处理，生成一个解密密钥。
    :param key: 输入的密钥字符串
    :return: 8字节解密密钥（字节数组）
    """
    # 将 "-" 替换为 ":"
    key_temp = key.replace("-", ":")

    # 将密钥转换为字节数组（UTF-8编码）
    key_bytes = key_temp.encode('utf-8')

    # 定义加密值
    encrypt_value = 211

    # 初始化解密密钥
    decrypt_key = [0] * 8

    # 对字节数组进行 XOR 操作，生成解密密钥
    decrypt_key[0] = key_bytes[7] ^ encrypt_value
    decrypt_key[1] = key_bytes[4] ^ encrypt_value
    decrypt_key[2] = key_bytes[11] ^ encrypt_value
    decrypt_key[3] = key_bytes[16] ^ encrypt_value
    decrypt_key[4] = key_bytes[15]
    decrypt_key[5] = key_bytes[9]
    decrypt_key[6] = key_bytes[12]
    decrypt_key[7] = key_bytes[10]
  
    return decrypt_key


def decrypt_error_code(err_code, key):
    """
    解码错误码的函数。
    :param err_code: 32位错误码（整数）
    :param key: 8字节密钥（字节数组）
    :return: 解码后的错误码（整数）
    """
    # 将错误码从十六进制字符串转换为整数
    err_code = int(err_code, 16)
    key = operate_key(key)

    # 将错误码转换为字节数组
    encrypt_err_code = [(err_code >> (8 * i)) & 0xFF for i in range(4)]
    encrypt_err_code.reverse()  # 反转字节顺序
  
    # 使用密钥对字节数组进行异或操作
    decrypt_err_code = [encrypt_err_code[i] ^ key[i] for i in range(4)]

    # 将解码后的字节数组重新组合为32位整数
    decrypted_err_code = (
        decrypt_err_code[0] * (256 ** 3) +
        decrypt_err_code[3] * (256 ** 2) +
        decrypt_err_code[1] * 256 +
        decrypt_err_code[2]
    )
    #16进制的str
    decrypted_err_code = hex(decrypted_err_code) 
    #去除前缀 '0x'
    decrypted_err_code = decrypted_err_code[2:]
    return decrypted_err_code


def decrypt_para(para, key):
      # 将错误码从十六进制字符串转换为整数
    para = int(para, 16)
    key = operate_key(key)

    p_temp = 0xA16D768E
    if para != p_temp:
        # 将 para 转换为字节数组
        encrypt_para = para.to_bytes(4, byteorder='big')
        # 使用 key 的后 4 个字节进行异或操作
        decrypt_para = bytes([encrypt_para[i] ^ key[i + 4] for i in range(4)])
        # 将解密后的字节数组转换回整数
        decrypted_para = int.from_bytes(decrypt_para, byteorder='big', signed=True)
    else:
        decrypted_para = 0
    return decrypted_para
   
def get_user_info_and_op_info(err_code_dec, p1, p2, p3, p4):
    """获取用户信息和操作信息"""
    # 此处返回一个简单的描述列表，根据需求进行修改
    return [f"Error Code: {err_code_dec}", f"Params: {p1}, {p2}, {p3}, {p4}"]

def translate_per_line(key):
    """将输入行进行解析和处理"""
    line=""
    split = line.split()
    
    # 解析日期和时间
    date, time = parse_datetime(split[0])
    
    # 解析错误码和其他参数
    err_code = split[1]
    err_code_dec = int(err_code, 16)
    
    p1_temp = int(split[2], 16)
    p2_temp = int(split[3], 16)
    p3_temp = int(split[4], 16)
    p4_temp = int(split[5], 16)
    
    # 操作密钥
    key_temp = key.replace("-", ":")
    decrypt_key = [0] * 8
    encrypt_value = 211
    
    decrypt_key[0] = ord(key_temp[7]) ^ encrypt_value
    decrypt_key[1] = ord(key_temp[4]) ^ encrypt_value
    decrypt_key[2] = ord(key_temp[11]) ^ encrypt_value
    decrypt_key[3] = ord(key_temp[16]) ^ encrypt_value
    decrypt_key[4] = ord(key_temp[15])
    decrypt_key[5] = ord(key_temp[9])
    decrypt_key[6] = ord(key_temp[12])
    decrypt_key[7] = ord(key_temp[10])
    
    # 解密错误码
    err_code_dec = decrypt_error_code(err_code_dec, decrypt_key)
    err_code_dec_temp = hex(err_code_dec)[2:]
    err_level = err_code_dec_temp[-2:]
    err_code4 = err_code_dec_temp[-4:-2]
    err_code6 = err_code_dec_temp[:6]
    
    # 解密参数
    p1 = decrypt_para(p1_temp, decrypt_key)
    p2 = decrypt_para(p2_temp, decrypt_key)
    p3 = decrypt_para(p3_temp, decrypt_key)
    p4 = decrypt_para(p4_temp, decrypt_key)
    
    # 获取用户信息和操作信息
    err_desc = get_user_info_and_op_info(err_code_dec, p1, p2, p3, p4)
    
    # 组装返回结果
    ret = [str(date), str(time), ""] + err_desc
    
    return ret

