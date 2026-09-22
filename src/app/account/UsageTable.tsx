import { formatFJD } from '@/domain/money';
import type { UsagePoint } from '@/domain/types';

/**
 * The usage chart is a table.
 *
 * The bars are drawn with CSS from the same numbers the table already shows, so
 * there is one source of truth and no hidden duplicate to drift. Remove the
 * stylesheet and it is still a correct table of figures; a screen reader needs
 * no alternative text because the data *is* the text.
 *
 * An SVG chart with a visually hidden table would have held the same numbers
 * twice, and the hidden copy is the one nobody looks at, so it is the one that
 * rots.
 */
export function UsageTable({ points }: { points: readonly UsagePoint[] }) {
  if (points.length === 0) {
    return (
      <div className="vw-card">
        <h2>Usage</h2>
        <p className="vw-muted">
          We have no usage history for your account yet. It appears here once your first bill is
          issued.
        </p>
      </div>
    );
  }

  const peak = Math.max(...points.map((p) => p.kilolitres));

  return (
    <div className="vw-card">
      <table className="vw-table vw-usage">
        <caption>
          Water used each month, in kilolitres, with the amount charged. Most recent last.
        </caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Used</th>
            <th scope="col">Charged</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <th scope="row">{point.month}</th>
              <td>
                {/*
                  The bar is presentation only and carries no information the
                  cell does not already state in words.
                */}
                <span
                  className="vw-bar"
                  style={{ width: `${peak === 0 ? 0 : Math.round((point.kilolitres / peak) * 100)}%` }}
                  aria-hidden="true"
                />
                {point.kilolitres} kL
              </td>
              <td>{formatFJD(point.costMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
