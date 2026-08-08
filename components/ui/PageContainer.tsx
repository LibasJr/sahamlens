import React from 'react';
import { cn } from '../../lib/utils/cn';

export function PageContainer({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mx-auto w-full max-w-[1680px]', className)} {...props}>
      {children}
    </div>
  );
}

export default PageContainer;
