-- PostgreSQL手术统计表脚本
-- 专门用于PostgreSQL数据库，包含PostgreSQL特有的数据类型和功能

-- 连接到logtool数据库
-- 注意：请确保PostgreSQL中已创建logtool数据库

-- 1. 手术统计主表
CREATE TABLE surgeries (
    id SERIAL PRIMARY KEY,
    surgery_id VARCHAR(50) UNIQUE NOT NULL,
    source_log_ids INT[],            -- 溯源的日志文件
    device_ids TEXT[],               -- 设备编号
    log_entry_start_id INT,          -- 起始日志条目
    log_entry_end_id INT,            -- 结束日志条目
    start_time TIMESTAMP,  -- 手术开始时间（原始时间，无时区概念）
    end_time TIMESTAMP,    -- 手术结束时间（原始时间，无时区概念）
    has_fault BOOLEAN,
    is_remote BOOLEAN,
    success BOOLEAN,
    structured_data JSONB,           -- 当前有效的手术结构化数据
    last_analyzed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 手术版本记录表
CREATE TABLE IF NOT EXISTS surgery_versions (
    id SERIAL PRIMARY KEY,
    surgery_id INTEGER NOT NULL,
    structured_data JSONB,
    source_logs INTEGER[],              -- 使用PostgreSQL数组类型存储日志文件ID
    created_by VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (surgery_id) REFERENCES surgeries(id) ON DELETE CASCADE
);
-- 术式记录
CREATE TABLE procedures (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_cn VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE surgery_procedures (
    surgery_id INT REFERENCES surgeries(id) ON DELETE CASCADE,
    procedure_id INT REFERENCES procedures(id) ON DELETE CASCADE,
    PRIMARY KEY (surgery_id, procedure_id)
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
    "success": false,
    "network_latency_ms": [
      {"time": "2025-09-11 05:20:00", "latency": 120},
      {"time": "2025-09-11 05:21:00", "latency": 80},
      {"time": "2025-09-11 05:22:00", "latency": 200}
    ],
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

{
  "surgery_id": "4372-14-202509111318",
  "device_ids": [
    "4372-14"
  ],
  "start_time": "2025-09-11T05:18:53.000Z",
  "end_time": "2025-09-11T06:31:15.000Z",
  "is_remote": false,
  "structured_data": {
    "power_cycles": [
      {
        "on_time": "2025-09-11T03:35:54.000Z",
        "off_time": null
      }
    ],
    "arms": [
      {
        "arm_id": 1,
        "instrument_usage": [
          {
            "tool_type": "双极鸭嘴电凝钳",
            "udi": "IN8033-2503036",
            "start_time": "2025-09-11T05:15:21.000Z",
            "end_time": "2025-09-11T06:22:22.000Z",
            "energy_activation": []
          }
        ]
      },
      {
      {
        "arm_id": 2,
        "instrument_usage": [
          {
            "tool_type": "30度内窥镜",
            "udi": "ECO8570-2504018",
            "start_time": "2025-09-11T05:14:42.000Z",
            "end_time": "2025-09-11T05:17:20.000Z",
            "energy_activation": []
          },
           {
            "tool_type": "30度内窥镜",
            "udi": "ECO8570-2504018",
            "start_time": "2025-09-11T05:17:37.000Z",
            "end_time": "2025-09-11T05:17:53.000Z",
            "energy_activation": []
          },
          {
            "tool_type": "30度内窥镜",
            "udi": "ECO8570-2504018",
            "start_time": "2025-09-11T05:18:33.000Z",
            "end_time": "2025-09-11T06:00:29.000Z",
            "energy_activation": []
          },
          {
            "tool_type": "30度内窥镜",
            "udi": "ECO8570-2504018",
            "start_time": "2025-09-11T06:00:49.000Z",
            "end_time": "2025-09-11T06:22:29.000Z",
            "energy_activation": []
          }
        ]
      },
      {
        "arm_id": 3,
        "instrument_usage": [
          {
            "tool_type": "新持针",
            "udi": "IN8031-2411059",
            "start_time": "2025-09-11T05:40:22.000Z",
            "end_time": "2025-09-11T05:43:07.000Z",
            "energy_activation": []
          },
          {
            "tool_type": "弧剪",
            "udi": "IN8035-2411067",
            "start_time": "2025-09-11T05:43:21.000Z",
            "end_time": "2025-09-11T06:04:53.000Z",
            "energy_activation": []
          },
          {
            "tool_type": "新持针",
            "udi": "IN8031-2411059",
            "start_time": "2025-09-11T06:05:03.000Z",
            "end_time": "2025-09-11T06:22:18.000Z",
            "energy_activation": []
          }
        ]
      },
      {
        "arm_id": 4,
        "instrument_usage": [
          {
            "tool_type": "鸭嘴抓钳",
            "udi": "IN803A-2410027",
            "start_time": "2025-09-11T05:16:09.000Z",
            "end_time": "2025-09-11T06:21:17.000Z",
            "energy_activation": []
          }
        ]
      }
    ],
    "surgery_stats": {
      "has_fault": false,
      "success": true,
      "is_remote": false,
      "network_latency_ms": [],
      "faults": [],
      "arm_switch_count": 0,
      "left_hand_clutch": 0,
      "right_hand_clutch": 0,
      "foot_clutch": 0,
      "endoscope_pedal": 0
    }
  },
  "last_analyzed_at": "2025-09-15T04:56:08.777Z",
  "created_at": "2025-09-15T04:56:08.777Z",
  "updated_at": "2025-09-15T04:56:08.777Z"
}