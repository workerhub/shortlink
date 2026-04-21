import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { BarChart2 } from 'lucide-react'

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e', '#a855f7']

export default function AnalyticsPage() {
  const [searchParams] = useSearchParams()
  const [linkId, setLinkId] = useState(searchParams.get('linkId') ?? '')
  const [days, setDays] = useState(30)
  const [inputLinkId, setInputLinkId] = useState(linkId)

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', linkId, days],
    queryFn: () => analyticsApi.get(linkId, days),
    enabled: !!linkId,
  })

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      {/* Link selector */}
      <div className="flex gap-3 items-end">
        <div className="flex-1 space-y-1">
          <Label>Link ID</Label>
          <Input
            placeholder="Paste a link ID"
            value={inputLinkId}
            onChange={(e) => setInputLinkId(e.target.value)}
          />
        </div>
        <Button onClick={() => setLinkId(inputLinkId)} disabled={!inputLinkId}>
          View
        </Button>
        <div className="flex gap-1">
          {([7, 14, 30, 90] as const).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? 'default' : 'outline'}
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {!linkId && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <BarChart2 className="h-12 w-12 opacity-30" />
          <p>Select a link to view its analytics</p>
        </div>
      )}

      {isLoading && <div className="text-center py-12 text-muted-foreground">Loading...</div>}
      {error && <div className="text-destructive">Failed to load analytics</div>}

      {data && (
        <>
          {/* Link info */}
          <div className="text-sm text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{data.link.slug}</span>
            {' → '}
            <a
              href={data.link.destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {data.link.destinationUrl}
            </a>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Clicks" value={data.stats.totalClicks} />
            <StatCard title="Countries" value={data.stats.countries.length} />
            <StatCard
              title="Top Device"
              value={data.stats.devices[0]?.device_type ?? '—'}
            />
            <StatCard title="Top Browser" value={data.stats.browsers[0]?.browser ?? '—'} />
          </div>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Clicks Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.stats.timeline}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Device + Country breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Devices</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={data.stats.devices}
                      dataKey="clicks"
                      nameKey="device_type"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ device_type, percent }) =>
                        `${device_type} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {data.stats.devices.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Countries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.stats.countries.slice(0, 8).map((c) => (
                    <div key={c.country} className="flex items-center justify-between text-sm">
                      <span>{c.country}</span>
                      <span className="font-medium">{c.clicks}</span>
                    </div>
                  ))}
                  {data.stats.countries.length === 0 && (
                    <p className="text-muted-foreground text-sm">No data yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Browsers + Referrers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Browsers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.stats.browsers.map((b) => (
                    <div key={b.browser} className="flex items-center justify-between text-sm">
                      <span>{b.browser}</span>
                      <span className="font-medium">{b.clicks}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Referrers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.stats.referrers.slice(0, 8).map((r) => (
                    <div key={r.referer} className="flex items-center justify-between text-sm gap-2">
                      <span className="truncate text-muted-foreground">{r.referer}</span>
                      <span className="font-medium flex-shrink-0">{r.clicks}</span>
                    </div>
                  ))}
                  {data.stats.referrers.length === 0 && (
                    <p className="text-muted-foreground text-sm">No referrer data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}
