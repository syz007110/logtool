-- PostgreSQL手术统计表脚本
-- 专门用于PostgreSQL数据库，包含PostgreSQL特有的数据类型和功能

-- 连接到logtool数据库
-- 注意：请确保PostgreSQL中已创建logtool数据库

-- 1. 手术统计主表
CREATE TABLE IF NOT EXISTS surgeries (
    id SERIAL PRIMARY KEY,
    surgery_id VARCHAR(50) UNIQUE NOT NULL,
    device_ids TEXT[],                  -- 使用TEXT数组存储设备编号（与surgery_id前缀一致）
    start_time TIMESTAMP NULL,
    end_time TIMESTAMP NULL,
    is_remote BOOLEAN DEFAULT FALSE,
    structured_data JSONB,              -- 使用JSONB类型存储手术结构化数据
    last_analyzed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 手术版本记录表
CREATE TABLE IF NOT EXISTS surgery_versions (
    id SERIAL PRIMARY KEY,
    surgery_id INTEGER NOT NULL,
    structured_data JSONB,
    source_logs INTEGER[],              -- 使用PostgreSQL数组类型存储日志文件ID
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (surgery_id) REFERENCES surgeries(id) ON DELETE CASCADE
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_surgeries_start_time ON surgeries(start_time);
CREATE INDEX IF NOT EXISTS idx_surgeries_end_time ON surgeries(end_time);
CREATE INDEX IF NOT EXISTS idx_surgeries_surgery_id ON surgeries(surgery_id);
CREATE INDEX IF NOT EXISTS idx_surgery_versions_surgery_id ON surgery_versions(surgery_id);

-- 4. 显示创建结果
SELECT 'PostgreSQL手术统计表创建完成！' AS message;
SELECT 'surgeries' AS table_name, COUNT(*) AS count FROM surgeries
UNION ALL
SELECT 'surgery_versions' AS table_name, COUNT(*) AS count FROM surgery_versions;

-- 5. 验证表结构
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('surgeries', 'surgery_versions')
ORDER BY table_name, ordinal_position;


{
  "power_cycles": [
    {"on_time": "08:55", "off_time": "09:05"},
    {"on_time": "09:10", "off_time": "09:15"}
  ],
  "arms": [
    {
      "arm_id": 1,
      "instrument_usage": [
        {
          "tool_type": "剪刀",
          "udi": "UDI-123456",
          "start_time": "09:00",
          "end_time": "09:05",
          "energy_activation": [{"start":"09:01","end":"09:02"}]
        },
  {
          "tool_type": "缝合器",
          "udi": "UDI-654321",
          "start_time": "09:06",
          "end_time": "09:10"
        }
      ]
    },
    {
      "arm_id": 2,
      "instrument_usage": [
        {
          "tool_type": "钳子",
          "udi": "UDI-987654",
          "start_time": "09:02",
          "end_time": "09:08"
        }
      ]
    },
    {
      "arm_id": 3,
      "instrument_usage": []
    },
   {
      "arm_id": 4,
      "instrument_usage": []
    }
  ],
  "surgery_stats": {
    "has_fault": true,
    "success": false,
    "is_remote": true,
    "network_latency_ms": [120, 80, 200],
    "faults": [
      {"timestamp": "09:02", "error_code": "E101","param1":"val1","param2":"val2","param3":"","param4":"","explanation":"机械臂故障","log_id":123}
    ],
    "state_machine": [{"time":"09:00","state":"INIT"},{"time":"09:01","state":"READY"}],
    "arm_switch_count": 3,
     "left_hand_clutch": 4,
    "right_hand_clutch": 5,
    "foot_clutch": 6,
    "endoscope_pedal": 7
  }
}