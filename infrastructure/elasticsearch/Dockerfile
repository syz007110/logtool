# Elasticsearch with IK Chinese Analyzer Plugin
# 使用 ES 9.2.0（与客户端版本匹配）
FROM docker.elastic.co/elasticsearch/elasticsearch:9.2.0

# 切换到root用户安装插件
USER root

# 安装IK中文分词插件（匹配 ES 9.2.0 版本）
# 使用 infinilabs 官方稳定版下载地址：https://release.infinilabs.com/analysis-ik/stable/
RUN bin/elasticsearch-plugin install --batch https://release.infinilabs.com/analysis-ik/stable/elasticsearch-analysis-ik-9.2.0.zip || \
    echo "Warning: IK plugin installation failed, you may need to install it manually"

# 创建插件目录权限（确保elasticsearch用户可访问）
RUN chown -R elasticsearch:elasticsearch /usr/share/elasticsearch/plugins

# 切换回elasticsearch用户
USER elasticsearch

# 暴露端口
EXPOSE 9200 9300
