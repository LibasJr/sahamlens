import React from 'react';
import { cn } from '../../lib/utils/cn';

export function PageContainer({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('max-w-[1600px] mx-auto w-full', className)} {...props}>
      {children}
    </div>
  );
}

export default PageContainer;
