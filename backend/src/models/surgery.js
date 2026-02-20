const { DataTypes } = require('sequelize');
const { postgresqlSequelize } = require('../config/postgresql');

/**
 * 手术数据模型 - PostgreSQL
 * 对应数据库中的surgeries表
 */
const Surgery = postgresqlSequelize.define('Surgery', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  surgery_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '手术唯一标识'
  },
  // 溯源的日志文件ID列表（PostgreSQL数组）
  source_log_ids: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: true,
    comment: '溯源的日志文件ID数组'
  },
  device_id: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '关联的设备编号'
  },
  // 起止日志条目ID范围（用于快速查看手术涉及的日志）
  log_entry_start_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '起始日志条目ID'
  },
  log_entry_end_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '结束日志条目ID'
  },
  log_entry_start_log_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '起始日志条目所属log_id'
  },
  log_entry_end_log_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '结束日志条目所属log_id'
  },
  start_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '手术开始时间（原始时间，无时区）'
  },
  end_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '手术结束时间（原始时间，无时区）'
  },
  has_fault: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    comment: '是否发生故障'
  },
  is_remote: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否为远程手术'
  },
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    comment: '手术是否成功'
  },
  structured_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: '手术结构化数据'
  },
  last_analyzed_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '最后分析时间'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '创建时间'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '更新时间'
  }
}, {
  tableName: 'surgeries',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['surgery_id']
    },
    {
      fields: ['start_time']
    },
    {
      fields: ['end_time']
    },
    {
      fields: ['is_remote']
    },
    {
      fields: ['last_analyzed_at']
    },
    {
      fields: ['device_id']
    }
  ]
});

/**
 * 手术统计查询方法
 */
Surgery.findByTimeRange = async function(startTime, endTime, options = {}) {
  const where = {};
  
  if (startTime && endTime) {
    where.start_time = {
      [postgresqlSequelize.Op.between]: [startTime, endTime]
    };
  } else if (startTime) {
    where.start_time = {
      [postgresqlSequelize.Op.gte]: startTime
    };
  } else if (endTime) {
    where.start_time = {
      [postgresqlSequelize.Op.lte]: endTime
    };
  }
  
  if (options.isRemote !== undefined) {
    where.is_remote = options.isRemote;
  }
  
  return await this.findAll({
    where,
    order: [['start_time', 'DESC']],
    limit: options.limit || 100,
    offset: options.offset || 0
  });
};

/**
 * 获取手术统计信息
 */
Surgery.getStatistics = async function(startTime, endTime) {
  const where = {};
  
  if (startTime && endTime) {
    where.start_time = {
      [postgresqlSequelize.Op.between]: [startTime, endTime]
    };
  }
  
  const totalSurgeries = await this.count({ where });
  const remoteSurgeries = await this.count({ 
    where: { ...where, is_remote: true } 
  });
  
  // 计算平均手术时长
  const surgeries = await this.findAll({
    where,
    attributes: [
      [postgresqlSequelize.fn('AVG', postgresqlSequelize.fn('EXTRACT', postgresqlSequelize.literal('EPOCH FROM (end_time - start_time) / 60'))), 'avg_duration_minutes'],
      [postgresqlSequelize.fn('COUNT', postgresqlSequelize.col('id')), 'total_count']
    ]
  });
  
  const avgDuration = surgeries[0]?.dataValues?.avg_duration_minutes || 0;
  
  return {
    totalSurgeries,
    remoteSurgeries,
    localSurgeries: totalSurgeries - remoteSurgeries,
    avgDurationMinutes: Math.round(avgDuration * 100) / 100
  };
};

/**
 * 根据结构化数据查询手术
 */
Surgery.findByStructuredData = async function(query, options = {}) {
  const where = {};
  
  // 查询故障手术
  if (query.hasFault !== undefined) {
    where.structured_data = {
      'surgery_stats.has_fault': query.hasFault
    };
  }
  
  // 查询远程手术
  if (query.isRemote !== undefined) {
    where.structured_data = {
      'surgery_stats.is_remote': query.isRemote
    };
  }
  
  // 查询特定器械使用
  if (query.instrumentType) {
    where.structured_data = {
      'arms': {
        [postgresqlSequelize.Op.contains]: [{
          instrument_usage: {
            [postgresqlSequelize.Op.contains]: [{
              tool_type: query.instrumentType
            }]
          }
        }]
      }
    };
  }
  
  return await this.findAll({
    where,
    order: [['start_time', 'DESC']],
    limit: options.limit || 100,
    offset: options.offset || 0
  });
};

module.exports = Surgery;
