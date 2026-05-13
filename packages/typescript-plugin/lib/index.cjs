'use strict'

const {
  createTempblotLanguagePlugin,
  createTempblotServicePlugin
} = require('tempblot-language-service')
const {
  createLanguageServicePlugin
} = require('@volar/typescript/lib/quickstart/createLanguageServicePlugin.js')

const plugin = createLanguageServicePlugin((ts, info) => {
  return {
    languagePlugins: [createTempblotLanguagePlugin()],
    servicePlugins: [createTempblotServicePlugin()]
  }
})

module.exports = plugin
