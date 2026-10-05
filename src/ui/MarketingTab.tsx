import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import {
  activeCampaigns,
  CHANNEL_IDS,
  CHANNELS,
  daysLeft,
  type Campaign,
  type Channel,
} from '../sim/marketing'
import { useGame } from '../state/store'
import { formatMoney } from './format'

function ChannelRow({
  channel,
  cash,
  running,
}: {
  channel: Channel
  cash: number
  running: number
}) {
  const info = CHANNELS[channel]
  const short = cash < info.cost
  const touch = useMediaQuery(COARSE)
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">
          {info.label}
          {running > 0 && <span className="stock-badge">{running} booked</span>}
        </div>
        <div className="staff-meta">
          {info.days} days · ~{info.visitors} extra visitor{info.visitors === 1 ? '' : 's'} a day
        </div>
        <div className="staff-blurb muted">{info.reaches}</div>
      </div>
      <div className="staff-wage price">{formatMoney(info.cost)}</div>
      <div className="stock-actions">
        <button
          className="btn btn-small btn-primary"
          disabled={short}
          title={short ? 'Not enough cash for that campaign.' : 'Pay now; it starts tomorrow'}
          onClick={() => useGame.getState().launchCampaign(channel)}
        >
          Book
        </button>
      </div>
      {touch && short && <div className="stock-why muted">Not enough cash.</div>}
    </li>
  )
}

function CampaignRow({ c, day }: { c: Campaign; day: number }) {
  const left = daysLeft(c, day)
  const when =
    c.startDay > day
      ? `Starts tomorrow · ${left} day${left === 1 ? '' : 's'}`
      : `${left} day${left === 1 ? '' : 's'} left${left === 1 ? ' (last day today)' : ''}`
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">{CHANNELS[c.channel].label}</div>
        <div className="staff-meta">{when}</div>
      </div>
    </li>
  )
}

/**
 * Ad campaigns: book one (paid now, runs from tomorrow) and see what's
 * running. A second run of a channel at once brings fewer extra visitors.
 */
export function MarketingTab() {
  const cash = useGame((s) => s.cash)
  const day = useGame((s) => s.clock.day)
  const campaigns = useGame((s) => s.campaigns)
  const spent = useGame((s) => s.dayStats.marketing)
  const live = campaigns.filter((c) => daysLeft(c, day) > 0)
  // Booked runs that bring visitors tomorrow, by channel, for the "booked" badge.
  const tomorrow = activeCampaigns(campaigns, day + 1)
  return (
    <>
      <h2>Advertise</h2>
      <dl className="stock-summary">
        <dt>Cash</dt>
        <dd className="price topbar-cash">{formatMoney(cash)}</dd>
        <dt>Spent today</dt>
        <dd className="price">{formatMoney(spent)}</dd>
      </dl>
      <ul className="staff-list">
        {CHANNEL_IDS.map((channel) => (
          <ChannelRow
            key={channel}
            channel={channel}
            cash={cash}
            running={tomorrow.filter((c) => c.channel === channel).length}
          />
        ))}
      </ul>
      <p className="muted staff-blurb">
        Running the same channel twice at once brings fewer extra visitors the second time.
      </p>
      <h3>Campaigns ({live.length})</h3>
      {live.length === 0 ? (
        <p className="muted staff-empty">No campaigns running.</p>
      ) : (
        <ul className="staff-list">
          {live.map((c) => (
            <CampaignRow key={c.id} c={c} day={day} />
          ))}
        </ul>
      )}
    </>
  )
}
