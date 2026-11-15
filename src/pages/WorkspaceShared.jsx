import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { EmptyState, Loading, StatusBadge } from '../components/ui'
import { formatDate, formatTime } from '../utils/format'

export function useRequest(load, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = async () => {
    setLoading(true); setError('')
    try { setData(await load()) } catch (problem) { setError(problem.message || 'Unable to load this information.') } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, deps)
  return { data, setData, loading, error, refresh }
}
export function Workspace({ children, className = '' }) {
  return <section className={'workspace ' + className}><div className="container">{children}</div></section>
}
export function EventRows({ events, action, emptyTitle = 'No events yet', emptyText = 'Events will appear here when they are available.' }) {
  return events.length ? <div className="event-row-list">{events.map((event) => <div className="event-row" key={event.event_id}><div className="event-row-date"><strong>{new Date(event.start_at).getDate()}</strong><span>{new Date(event.start_at).toLocaleDateString(undefined, { month: 'short' })}</span></div><div className="event-row-info"><strong>{event.title}</strong><span><CalendarDays size={14} />{formatDate(event.start_at)} · {formatTime(event.start_at)}</span><span>{event.venue}</span></div><StatusBadge value={event.status} />{action?.(event)}</div>)}</div> : <EmptyState icon={CalendarDays} title={emptyTitle} description={emptyText} />
}
export function DataTable({ columns, rows }) {
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
}
export function LoadingOrError({ data }) {
  if (data.loading) return <Loading />
  return null
}
