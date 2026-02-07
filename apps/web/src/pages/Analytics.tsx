import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, DollarSign, Target, Award } from 'lucide-react'
import { formatCurrency } from '../lib/utils'

const fetchAnalytics = async () => {
  // Mock data
  return {
    funnel: [
      { name: 'Applied', value: 24 },
      { name: 'Phone Screen', value: 8 },
      { name: 'Interview', value: 5 },
      { name: 'Offer', value: 2 },
    ],
    costs: [
      { name: 'Week 1', amount: 5.20 },
      { name: 'Week 2', amount: 3.40 },
      { name: 'Week 3', amount: 2.85 },
      { name: 'Week 4', amount: 1.00 },
    ],
    byProvider: [
      { name: 'Ollama', value: 15 },
      { name: 'OpenAI', value: 8 },
      { name: 'Anthropic', value: 1 },
    ],
    metrics: {
      totalCost: 12.45,
      avgCostPerApp: 0.52,
      successRate: 8.3,
      totalTokens: 45000,
    }
  }
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

export function Analytics() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 mt-1">Track your application performance</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <DollarSign className="w-5 h-5" />
            <span className="text-sm">Total Cost</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(analytics?.metrics.totalCost || 0)}</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm">Avg Cost/App</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(analytics?.metrics.avgCostPerApp || 0)}</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Target className="w-5 h-5" />
            <span className="text-sm">Success Rate</span>
          </div>
          <p className="text-2xl font-bold">{analytics?.metrics.successRate}%</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Award className="w-5 h-5" />
            <span className="text-sm">Total Tokens</span>
          </div>
          <p className="text-2xl font-bold">{analytics?.metrics.totalTokens.toLocaleString()}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Application Funnel */}
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold mb-6">Application Funnel</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.funnel}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost Over Time */}
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold mb-6">Cost Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.costs}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="amount" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Provider */}
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold mb-6">Applications by Provider</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics?.byProvider}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {analytics?.byProvider.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
