const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  mapErrorCodeToolToSourceCards,
  buildAssistantPayloadFromAgentResult
} = require('./mapErrorCodeToolToSourceCards')

describe('mapErrorCodeToolToSourceCards', () => {
  it('maps error_code_lookup items to F1 with snake_case fields', () => {
    const { faultCodes } = mapErrorCodeToolToSourceCards([
      {
        toolName: 'error_code_lookup',
        data: {
          items: [
            {
              id: 42,
              subsystem: 'SYS',
              code: '1A00001',
              shortMessage: 'Motor fault',
              explanation: 'Overcurrent detected',
              userHint: 'Check wiring',
              operation: 'Reset',
              params: { param1: 'a', param2: 'b', param3: 'c', param4: 'd' },
              detail: 'Detail text',
              method: 'Method A',
              category: 'Hardware',
              techSolution: 'Replace board'
            }
          ]
        }
      }
    ])

    assert.equal(faultCodes.length, 1)
    assert.equal(faultCodes[0].ref, 'F1')
    assert.equal(faultCodes[0].id, 42)
    assert.equal(faultCodes[0].subsystem, 'SYS')
    assert.equal(faultCodes[0].code, '1A00001')
    assert.equal(faultCodes[0].short_message, 'Motor fault')
    assert.equal(faultCodes[0].explanation, 'Overcurrent detected')
    assert.equal(faultCodes[0].user_hint, 'Check wiring')
    assert.equal(faultCodes[0].operation, 'Reset')
    assert.equal(faultCodes[0].param1, 'a')
    assert.equal(faultCodes[0].param2, 'b')
    assert.equal(faultCodes[0].param3, 'c')
    assert.equal(faultCodes[0].param4, 'd')
    assert.equal(faultCodes[0].detail, 'Detail text')
    assert.equal(faultCodes[0].method, 'Method A')
    assert.equal(faultCodes[0].category, 'Hardware')
    assert.equal(faultCodes[0].tech_solution, 'Replace board')
  })

  it('ignores other tool names', () => {
    const { faultCodes } = mapErrorCodeToolToSourceCards([
      {
        toolName: 'other_tool',
        data: { items: [{ code: 'X', subsystem: 'Y' }] }
      },
      {
        toolName: 'error_code_lookup',
        data: { items: [] }
      }
    ])

    assert.deepEqual(faultCodes, [])
  })
})

describe('buildAssistantPayloadFromAgentResult', () => {
  it('sets answerText + sources.faultCodes', () => {
    const payload = buildAssistantPayloadFromAgentResult({
      text: '  Answer here  ',
      toolTraces: [
        {
          toolName: 'error_code_lookup',
          data: {
            items: [{ code: '1A00002', subsystem: 'ARM', shortMessage: 'Joint error' }]
          }
        }
      ]
    })

    assert.equal(payload.answerText, 'Answer here')
    assert.equal(payload.sources.faultCodes.length, 1)
    assert.equal(payload.sources.faultCodes[0].ref, 'F1')
    assert.equal(payload.sources.faultCodes[0].code, '1A00002')
    assert.equal(payload.toolTraces.length, 1)
  })
})
