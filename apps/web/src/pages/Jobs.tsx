import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  Search, 
  Filter, 
  Plus, 
  Briefcase,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react'
import { formatDate } from '../lib/utils'

const fetchJobs = async () => {
  const response = await fetch('/api/jobs')
  if (!response.ok) throw new Error('Failed to fetch jobs')
  return response.json()
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Briefcase }> = {
  new: { label: 'New', color: 'bg-gray-100 text-gray-800', icon: Briefcase },
  analyzed: { label: 'Analyzed', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  tailored: { label: 'Tailored', color: 'bg-purple-100 text-purple-800', icon: CheckCircle },
  submitted: { label: 'Submitted', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  interview: { label: 'Interview', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  offer: { label: 'Offer', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
}

export function Jobs() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs'],
    queryFn: fetchJobs,
  })

  const jobs = data?.jobs || []

  const filteredJobs = jobs.filter((job: any) => {
    const matchesSearch = 
      job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.company?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load jobs</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-500 mt-1">Manage your job applications</p>
        </div>
        <Link
          to="/jobs/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Job
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="new">New</option>
            <option value="analyzed">Analyzed</option>
            <option value="tailored">Tailored</option>
            <option value="submitted">Submitted</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Jobs List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {filteredJobs.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
            <p className="text-gray-500 mb-4">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your filters'
                : 'Get started by adding your first job'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <Link
                to="/jobs/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Job
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredJobs.map((job: any) => {
              const status = statusConfig[job.status] || statusConfig.new
              const StatusIcon = status.icon
              
              return (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${status.color}`}>
                      <StatusIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{job.title || 'Untitled Job'}</h3>
                      <p className="text-sm text-gray-500">{job.company || 'Unknown Company'}</p>
                      {job.fitScore > 0 && (
                        <p className="text-sm text-blue-600 mt-1">Fit Score: {job.fitScore}%</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${status.color}`}>
                      {status.label}
                    </span>
                    <span className="text-sm text-gray-400">
                      {formatDate(job.createdAt)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(statusConfig).map(([key, config]) => {
          const count = jobs.filter((j: any) => j.status === key).length
          if (count === 0) return null
          
          return (
            <div key={key} className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2">
                <config.icon className={`w-4 h-4 ${config.color.split(' ')[1]}`} />
                <span className="text-sm text-gray-500">{config.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
