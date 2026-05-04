export type Either<L, R> = Left<L> | Right<R>;

export interface Left<L> {
	readonly _tag: 'Left';
	readonly left: L;
}

export interface Right<R> {
	readonly _tag: 'Right';
	readonly right: R;
}

export const left = <L>(l: L): Left<L> => ({ _tag: 'Left', left: l });
export const right = <R>(r: R): Right<R> => ({ _tag: 'Right', right: r });

export const isLeft = <L, R>(e: Either<L, R>): e is Left<L> => e._tag === 'Left';
export const isRight = <L, R>(e: Either<L, R>): e is Right<R> => e._tag === 'Right';
