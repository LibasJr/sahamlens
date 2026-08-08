import React from 'react';
import { cn } from '../../lib/utils/cn';

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <div className="w-full overflow-x-auto rounded-2xl border border-white/[0.075] bg-tv-card/70"><table className={cn('w-full border-collapse text-sm', className)} {...props}>{children}</table></div>;
}
export function TableHeader({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) { return <thead className={cn('bg-white/[0.025]', className)} {...props}>{children}</thead>; }
export function TableBody({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) { return <tbody className={cn('divide-y divide-white/[0.055]', className)} {...props}>{children}</tbody>; }
export function TableRow({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) { return <tr className={cn('transition-colors duration-150 hover:bg-white/[0.035]', className)} {...props}>{children}</tr>; }
export function TableHead({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) { return <th className={cn('px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-tv-muted', className)} {...props}>{children}</th>; }
interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> { numeric?: boolean; }
export function TableCell({ numeric = false, className, children, ...props }: TableCellProps) { return <td className={cn('px-4 py-3 text-tv-text', numeric && 'text-right font-number tabular-nums', className)} {...props}>{children}</td>; }
export default Table;
