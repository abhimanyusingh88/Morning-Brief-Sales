"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card>
      <ErrorState title="This page could not load" body="It has been logged. Try again, or head back to Today." action={<Button onClick={reset} variant="primary">Try again</Button>} />
    </Card>
  );
}
