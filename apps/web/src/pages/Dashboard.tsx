import { useQuery } from '@tanstack/react-query'
import { 
  Briefcase, 
  TrendingUp, 
  DollarSign, 
  CheckCircle,
  Clock,
  AlertCircle,
  BarChart3
} from 'lucide-react'
import { formatCurrency } from '../lib/utils'
import { Link } from 'react-router-dom'

// Mock API calls - would be replaced with actual API
const fetchStats = async () => {
  // Simulated data
  return {
    totalJobs: 24,
    activeApplications: 8,
    interviews: 3,
    offers: 1,
    totalCost: 12.45,
    successRate: 15,
    recentJobs: [
      { id: '1', title: 'Senior Software Engineer', company: 'TechCorp', status: 'interview', date: '2024-01-15' },
      { id: '2', title: 'Full Stack Developer', company: 'StartupXYZ', status: 'submitted', date: '2024-01-14' },
      { id: '3', title: 'Product Manager', company: 'BigTech', status: 'offer', date: '2024-01-10' },
    ]
  }
}

export function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchStats,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const statCards = [
    { 
      name: 'Total Jobs', 
      value: stats?.totalJobs || 0, 
      icon: Briefcase, 
      color: 'bg-blue-500',
      change: '+4 this month'
    },
    { 
      name: 'Active Applications', 
      value: stats?.activeApplications || 0, 
      icon: Clock, 
      color: 'bg-yellow-500',
      change: 'Awaiting response'
    },
    { 
      name: 'Interviews', 
      value: stats?.interviews || 0, 
      icon: TrendingUp, 
      color: 'bg-green-500',
      change: 'Next: Tomorrow'
    },
    { 
      name: 'Total Cost', 
      value: formatCurrency(stats?.totalCost || 0), 
      icon: DollarSign, 
      color: 'bg-purple-500',
      change: 'This month'
    },
  ]

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-gray-100 text-gray-800',
      analyzed: 'bg-blue-100 text-blue-800',
      tailored: 'bg-purple-100 text-purple-800',
      submitted: 'bg-yellow-100 text-yellow-800',
      interview: 'bg-green-100 text-green-800',
      offer: 'bg-emerald-100 text-emerald-800',
      rejected: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your job search</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-4">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Success Rate */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Application Success Rate</h3>
            <p className="text-gray-500 mt-1">Based on applications submitted</p>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-2xl font-bold text-gray-900">{stats?.successRate}%</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${stats?.successRate}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Recent Jobs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Recent Applications</h3>
            <Link to="/jobs" className="text-sm text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
        </div>
        <div className="divide-y divide-gray-200">
          {stats?.recentJobs.map((job) => (
            <Link 
              key={job.id} 
              to={`/jobs/${job.id}`}
              className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
            >
              <div>
                <h4 className="font-medium text-gray-900">{job.title}</h4>
                <p className="text-sm text-gray-500">{job.company}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(job.status)}`}>
                  {job.status}
                </span>
                <span className="text-sm text-gray-400">{job.date}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">Add New Job</h3>
              <p className="text-blue-100 mt-1">Upload a job description and start tailoring</p>
            </div>
            <AlertCircle className="w-8 h-8 text-blue-200" />
          </div>
          <Link 
            to="/jobs/new"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors"
          >
            Get Started
          </Link>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">View Analytics</h3>
              <p className="text-purple-100 mt-1">Track your application performance</p>
            </div>
            <BarChart3 className="w-8 h-8 text-purple-200" />
          </div>
          <Link 
            to="/analytics"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-white text-purple-600 rounded-lg font-medium hover:bg-purple-50 transition-colors"
          >
            View Analytics
          </Link>
        </div>
      </div>
    </div>
  )
}
