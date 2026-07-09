const test = require('node:test');
const assert = require('node:assert/strict');

const {
  convertSaXmlPair,
  serializeCsv
} = require('../src/scripts/convertSaXmlToCsv');

const zhXml = `<?xml version='1.0' encoding='utf-8'?>
<Medbot>
  <instance>
    <subsystem id="1">
      <error_code id="0x010A">
        <axis>TRUE</axis>
        <description>双码盘偏差</description>
        <simple>硬件异常</simple>
        <userInfo>硬件异常</userInfo>
        <opinfo>请点击“解除”恢复</opinfo>
        <isArm>FALSE</isArm>
        <detInfo>双码盘偏差:报错时状态机{0}</detInfo>
        <method>方法说明</method>
        <para1>参数1</para1>
        <para2>参数2</para2>
        <para3>参数3</para3>
        <para4>参数4</para4>
        <expert>1.0</expert>
        <learner>1.0</learner>
        <action>recoverable</action>
      </error_code>
    </subsystem>
  </instance>
</Medbot>`;

const enXml = `<?xml version='1.0' encoding='utf-8'?>
<Medbot>
  <instance>
    <subsystem id="1">
      <error_code id="0x010A">
        <axis>TRUE</axis>
        <description>Dual encoder disk deviation</description>
        <simple>Hardware fault</simple>
        <userInfo>Hardware fault</userInfo>
        <opinfo>Please click "Recover" to restore</opinfo>
        <isArm>FALSE</isArm>
        <detInfo>Dual encoder disk deviation: state {0}</detInfo>
        <method>Method detail</method>
        <para1>Param1</para1>
        <para2>Param2</para2>
        <para3>Param3</para3>
        <para4>Param4</para4>
        <expert>1.0</expert>
        <learner>1.0</learner>
        <action>recoverable</action>
      </error_code>
    </subsystem>
  </instance>
</Medbot>`;

test('convertSaXmlPair maps SA xml into main and i18n records', async () => {
  const out = await convertSaXmlPair({
    zhXmlContent: zhXml,
    enXmlContent: enXml,
    seriesId: 2
  });

  assert.equal(out.errorCodes.length, 1);
  assert.equal(out.i18nZh.length, 1);
  assert.equal(out.i18nEn.length, 1);

  assert.deepEqual(out.errorCodes[0], {
    series_id: 2,
    subsystem: '1',
    code: '0X010A',
    is_axis_error: 1,
    is_arm_error: 0,
    solution: 'recoverable',
    for_expert: 1,
    for_novice: 1,
    related_log: 0,
    level: 'high',
    category: ''
  });

  assert.equal(out.i18nZh[0].lang, 'zh');
  assert.equal(out.i18nZh[0].detail, '双码盘偏差:报错时状态机{0}');
  assert.equal(out.i18nZh[0].short_message, '硬件异常');
  assert.equal(out.i18nEn[0].lang, 'en');
  assert.equal(out.i18nEn[0].operation, 'Please click "Recover" to restore');
});

test('serializeCsv writes stable headers and escaped rows', () => {
  const csv = serializeCsv(
    [{ series_id: 2, code: '0X010A', short_message: 'A,"B"' }],
    ['series_id', 'code', 'short_message']
  );

  assert.match(csv, /^series_id,code,short_message/m);
  assert.match(csv, /2,0X010A,"A,""B"""/);
});
