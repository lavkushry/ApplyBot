import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Save, Check, AlertCircle } from 'lucide-react'

const fetchSettings = async () => {
  return {
    llm: {
      provider: 'ollama',
      model: 'llama3.1:8b',
      temperature: 0.3,
    },
    tailoring: {
      maxSkills: 15,
      maxBulletPoints: 6,
      enforceTruthfulness: true,
    }
  }
}

const providers = [
  { id: 'ollama', name: 'Ollama (Local)', models: ['llama3.1:8b', 'llama3.1:70b', 'mistral:7b'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'] },
]

export function Settings() {
  const { isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const [formData, setFormData] = useState({
    provider: 'ollama',
    model: 'llama3.1:8b',
    temperature: 0.3,
    maxSkills: 15,
    maxBulletPoints: 6,
    enforceTruthfulness: true,
  })

  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const selectedProvider = providers.find(p => p.id === formData.provider)

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Configure your ApplyPilot preferences</p>
      </div>

      {/* LLM Settings */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold">LLM Configuration</h2>
          <p className="text-sm text-gray-500">Choose your AI provider and model</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provider
            </label>
            <select
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value, model: '' })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model
            </label>
            <select
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {selectedProvider?.models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Temperature: {formData.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={formData.temperature}
              onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Lower = more focused, Higher = more creative
            </p>
          </div>
        </div>
      </div>

      {/* Tailoring Settings */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Resume Tailoring</h2>
          <p className="text-sm text-gray-500">Customize how your resume is tailored</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Skills: {formData.maxSkills}
            </label>
            <input
              type="range"
              min="5"
              max="30"
              value={formData.maxSkills}
              onChange={(e) => setFormData({ ...formData, maxSkills: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Bullet Points: {formData.maxBulletPoints}
            </label>
            <input
              type="range"
              min="3"
              max="10"
              value={formData.maxBulletPoints}
              onChange={(e) => setFormData({ ...formData, maxBulletPoints: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="truthfulness"
              checked={formData.enforceTruthfulness}
              onChange={(e) => setFormData({ ...formData, enforceTruthfulness: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="truthfulness" className="text-sm font-medium text-gray-700">
              Enforce truthfulness (never invent skills/experiences)
            </label>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-900">Privacy Note</h4>
          <p className="text-sm text-blue-700 mt-1">
            When using local providers like Ollama, your data never leaves your machine. 
            External providers (OpenAI, Anthropic) will process your job descriptions on their servers.
          </p>
        </div>
      </div>
    </div>
  )
}
