import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Briefcase, Calendar, DollarSign } from 'lucide-react'
import { formatDate } from '../lib/utils'

const fetchJob = async (id: string) => {
  // Mock API call
  return {
    id,
    title: 'Senior Software Engineer',
    company: 'TechCorp',
    status: 'analyzed',
    jdText: 'We are looking for a Senior Software Engineer...',
    fitScore: 85,
    requirements: {
      mustHaveSkills: ['React', 'TypeScript', 'Node.js'],
      niceToHaveSkills: ['GraphQL', 'AWS'],
    },
    createdAt: '2024-01-15',
  }
}

export function JobDetail() {
  const { id } = useParams<{ id: string }>()
  
  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => fetchJob(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Job not found</h2>
        <Link to="/jobs" className="text-blue-600 hover:text-blue-700 mt-4 inline-block">
          Back to jobs
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/jobs" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
          <p className="text-gray-500">{job.company}</p>
        </div>
      </div>

      {/* Job Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Briefcase className="w-4 h-4" />
            <span className="text-sm">Status</span>
          </div>
          <p className="font-medium capitalize">{job.status}</p>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">Added</span>
          </div>
          <p className="font-medium">{formatDate(job.createdAt)}</p>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Fit Score</span>
          </div>
          <p className="font-medium">{job.fitScore}%</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Tailor Resume
        </button>
        <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
          Generate Cover Letter
        </button>
      </div>

      {/* Job Description */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Job Description</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-700 whitespace-pre-wrap">{job.jdText}</p>
        </div>
      </div>

      {/* Requirements */}
      {job.requirements && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Requirements</h2>
          </div>
          <div className="p-6">
            <div className="mb-4">
              <h3 className="font-medium text-gray-900 mb-2">Must-Have Skills</h3>
              <div className="flex flex-wrap gap-2">
                {job.requirements.mustHaveSkills?.map((skill: string) => (
                  <span key={skill} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Nice-to-Have Skills</h3>
              <div className="flex flex-wrap gap-2">
                {job.requirements.niceToHaveSkills?.map((skill: string) => (
                  <span key={skill} className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
