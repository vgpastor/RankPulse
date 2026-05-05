import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface DataTableColumn<T> {
	key: string;
	header: string;
	/** Render the cell. Receives the row and returns a React node. */
	cell: (row: T) => ReactNode;
	/** Optional className applied to the `<td>`. */
	className?: string;
	/** Hide this column on mobile (md:table-cell). */
	hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
	columns: DataTableColumn<T>[];
	rows: readonly T[];
	rowKey: (row: T) => string;
	empty?: ReactNode;
	className?: string;
}

/**
 * Mobile-first responsive table: a stacked card layout under `md`, a real
 * `<table>` from `md` upwards. Columns marked `hideOnMobile` collapse into
 * the card body on small screens (rendered as label/value pairs).
 */
export const DataTable = <T,>({ columns, rows, rowKey, empty, className }: DataTableProps<T>) => {
	if (rows.length === 0) {
		return <div className="py-6 text-center text-sm text-muted-foreground">{empty ?? 'No items.'}</div>;
	}

	return (
		<div className={cn('w-full', className)}>
			{/* Mobile: stacked cards */}
			<ul className="flex flex-col gap-3 md:hidden">
				{rows.map((row) => (
					<li key={rowKey(row)} className="rounded-lg border bg-card p-3 shadow-sm">
						<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
							{columns.map((col) => (
								<div key={col.key} className="contents">
									<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										{col.header}
									</dt>
									<dd className="break-words">{col.cell(row)}</dd>
								</div>
							))}
						</dl>
					</li>
				))}
			</ul>

			{/* md+: real table */}
			<div className="hidden md:block">
				<table className="w-full border-collapse text-sm">
					<thead>
						<tr className="border-b text-left">
							{columns.map((col) => (
								<th
									key={col.key}
									className={cn(
										'px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground',
									)}
								>
									{col.header}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={rowKey(row)} className="border-b last:border-b-0 hover:bg-muted/30">
								{columns.map((col) => (
									<td key={col.key} className={cn('px-3 py-2 align-top', col.className)}>
										{col.cell(row)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
};
