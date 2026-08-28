import { useMemo } from 'react';
import { BOXES, BOX_BY_ID, SETS } from '../data/catalog';
import { cheapestBasket } from '../domain/purchase';
import { eur, litres, skuColor } from './format';

interface Props {
  counts: Record<string, number>;
}

export default function ShoppingList({ counts }: Props) {
  const basket = useMemo(() => cheapestBasket(counts), [counts]);

  const rows = BOXES.filter((b) => (counts[b.id] ?? 0) > 0).map((b) => {
    const qty = counts[b.id]!;
    return { sku: b, qty, subtotal: qty * b.priceEur, capacity: qty * b.capacityL };
  });

  const totalPrice = rows.reduce((sum, r) => sum + r.subtotal, 0);
  const totalBoxes = rows.reduce((sum, r) => sum + r.qty, 0);
  const totalCapacity = rows.reduce((sum, r) => sum + r.capacity, 0);

  if (rows.length === 0) {
    return <p className="muted">Add a space to see what you need to order.</p>;
  }

  return (
    <div className="shopping">
      <table>
        <thead>
          <tr>
            <th>Box</th>
            <th>Footprint</th>
            <th>Height</th>
            <th className="num">Qty</th>
            <th className="num">Unit</th>
            <th className="num">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ sku, qty, subtotal }) => (
            <tr key={sku.id}>
              <td>
                <span className="swatch" style={{ background: skuColor(sku) }} />
                <a href={sku.url} target="_blank" rel="noreferrer noopener">
                  {sku.id}
                </a>
              </td>
              <td className="muted">
                {sku.widthCm} × {sku.depthCm} cm
              </td>
              <td className="muted">{sku.heightCm} cm</td>
              <td className="num">{qty}</td>
              <td className="num muted">{eur(sku.priceEur)}</td>
              <td className="num">{eur(subtotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>
              {totalBoxes} boxes · {litres(totalCapacity)} of storage
            </td>
            <td className="num">{totalBoxes}</td>
            <td />
            <td className="num">{eur(totalPrice)}</td>
          </tr>
        </tfoot>
      </table>
      <section className="basket">
        <h3>
          Cheapest way to buy this
          {basket.savingEur > 0.005 ? (
            <span className="basket__save">saves {eur(basket.savingEur)}</span>
          ) : (
            <span className="muted small">sets checked — none wins here</span>
          )}
        </h3>
        <ul>
          {basket.lines.map((line) => (
            <li key={`${line.kind}-${line.id}`}>
              <span className="basket__qty">{line.qty}×</span>
              <a href={line.url} target="_blank" rel="noreferrer noopener">
                {line.label}
              </a>
              <span className="muted">{eur(line.unitEur)} each</span>
              <span className="num">{eur(line.subtotalEur)}</span>
            </li>
          ))}
          <li className="basket__total">
            <span />
            <span>Total</span>
            <span className="muted">{eur(basket.singlesEur)} as singles</span>
            <span className="num">{eur(basket.totalEur)}</span>
          </li>
        </ul>
        {surplusText(basket.surplus) ? (
          <p className="muted small">
            Includes {surplusText(basket.surplus)} you have no room for — worth{' '}
            {eur(basket.surplusEur)} on its own, and still cheaper than skipping the set.
          </p>
        ) : null}
        {basket.lines.every((l) => l.kind === 'single') ? (
          <p className="muted small">
            A set has to be bought whole, and every one of them works out dearer per centimetre
            of shelf filled than a plain 2L or 3M. Sets pay off when you actually want the small
            sizes in them, not when you are filling space.
          </p>
        ) : null}
      </section>

      <p className="muted small">
        Prices are singles as listed on zwilling.com. Set contents are entered by hand from the
        product pages, which name the sizes in a set but not the quantities.
      </p>
      <ul className="sets">
        {SETS.map((s) => (
          <li key={s.productId}>
            <a href={s.url} target="_blank" rel="noreferrer noopener">
              {s.label}
            </a>{' '}
            <span className="muted">
              {contentsLabel(s.contents)} · {eur(s.priceEur)}
              {s.singlesEur > s.priceEur
                ? ` · ${eur(s.singlesEur - s.priceEur)} under singles`
                : ` · ${eur(s.priceEur - s.singlesEur)} over singles`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "1× S · 2× 2S · 1× 3S", in catalog order. */
function contentsLabel(contents: Record<string, number>): string {
  return BOXES.filter((b) => contents[b.id])
    .map((b) => `${contents[b.id]}× ${b.id}`)
    .join(' · ');
}

function surplusText(surplus: Record<string, number>): string {
  const label = contentsLabel(surplus);
  return label ? label.replace(/ · /g, ', ') : '';
}

export function mergeCounts(all: Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const counts of all) {
    for (const [id, n] of Object.entries(counts)) {
      if (!BOX_BY_ID.has(id)) continue;
      merged[id] = (merged[id] ?? 0) + n;
    }
  }
  return merged;
}
