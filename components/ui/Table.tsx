import React from 'react';
import { cn } from '../../lib/utils/cn';

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-tv-border">
      <table className={cn('w-full text-sm border-collapse', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('bg-tv-surface', className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-tv-border', className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors duration-150 hover:bg-tv-hover/50', className)} {...props}>
      {children}
    </tr>
  );
}

export function TableHead({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'text-left text-[11px] font-semibold uppercase tracking-wide text-tv-muted px-4 py-2.5',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function TableCell({ numeric = false, className, children, ...props }: TableCellProps) {
  return (
    <td
      className={cn('px-4 py-2.5 text-tv-text', numeric && 'font-number tabular-nums text-right', className)}
      {...props}
    >
      {children}
    </td>
  );
}

export default Table;
