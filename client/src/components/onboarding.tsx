import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Lightbulb, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useUser, useCompleteOnboarding, useDismissHint } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface TourStep {
  target: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

const tourSteps: TourStep[] = [
  {
    target: "[data-tour='discover']",
    title: "인플루언서 발견",
    description: "인플루언서를 등록하고 관리할 수 있습니다. 일괄 등록도 가능합니다.",
    position: "right",
  },
  {
    target: "[data-tour='campaigns']",
    title: "캠페인 관리",
    description: "캠페인을 생성하고 인플루언서를 배정하여 진행 상황을 추적하세요.",
    position: "right",
  },
  {
    target: "[data-tour='email']",
    title: "이메일 센터",
    description: "Gmail을 연동하여 인플루언서와 소통하고, 대량 이메일을 발송할 수 있습니다.",
    position: "right",
  },
  {
    target: "[data-tour='finance']",
    title: "정산 관리",
    description: "정산 현황을 확인하고 지급 상태를 관리하세요.",
    position: "right",
  },
  {
    target: "[data-tour='settings']",
    title: "설정",
    description: "클라이언트, 계약서 템플릿, 사용자를 관리할 수 있습니다.",
    position: "right",
  },
];

export function TourGuide() {
  const { data: user } = useUser();
  const completeOnboarding = useCompleteOnboarding();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (user && user.onboardingCompleted === false) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        setIsReady(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user]);

  useEffect(() => {
    if (!isVisible || !isReady) return;

    const step = tourSteps[currentStep];
    const element = document.querySelector(step.target);
    
    const TOOLTIP_WIDTH = 320;
    const TOOLTIP_HEIGHT = 140;
    const MARGIN = 16;
    
    if (element) {
      const rect = element.getBoundingClientRect();
      let top = rect.top + rect.height / 2 - TOOLTIP_HEIGHT / 2;
      let left = rect.right + MARGIN;

      if (step.position === "bottom") {
        top = rect.bottom + MARGIN;
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      } else if (step.position === "top") {
        top = rect.top - TOOLTIP_HEIGHT - MARGIN;
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      } else if (step.position === "left") {
        left = rect.left - TOOLTIP_WIDTH - MARGIN;
      }

      if (left + TOOLTIP_WIDTH > window.innerWidth - MARGIN) {
        left = window.innerWidth - TOOLTIP_WIDTH - MARGIN;
      }
      if (left < MARGIN) {
        left = MARGIN;
      }
      if (top + TOOLTIP_HEIGHT > window.innerHeight - MARGIN) {
        top = window.innerHeight - TOOLTIP_HEIGHT - MARGIN;
      }
      if (top < MARGIN) {
        top = MARGIN;
      }

      setTooltipPosition({ top, left });
      
      element.classList.add("ring-2", "ring-primary", "ring-offset-2", "z-50");
      
      return () => {
        element.classList.remove("ring-2", "ring-primary", "ring-offset-2", "z-50");
      };
    } else {
      setTooltipPosition({
        top: window.innerHeight / 2 - TOOLTIP_HEIGHT / 2,
        left: window.innerWidth / 2 - TOOLTIP_WIDTH / 2,
      });
    }
  }, [currentStep, isVisible, isReady]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    completeOnboarding.mutate();
    setIsVisible(false);
  };

  const handleSkip = () => {
    completeOnboarding.mutate();
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const step = tourSteps[currentStep];

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={handleSkip}
        data-testid="tour-overlay"
      />
      <Card
        className="fixed z-50 w-80 shadow-lg"
        style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
        data-testid="tour-tooltip"
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{step.title}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleSkip}
              data-testid="button-tour-skip"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className="text-sm">{step.description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {currentStep + 1} / {tourSteps.length}
            </span>
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  data-testid="button-tour-prev"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  이전
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleNext}
                data-testid="button-tour-next"
              >
                {currentStep === tourSteps.length - 1 ? "완료" : "다음"}
                {currentStep < tourSteps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

interface FeatureHintProps {
  hintId: string;
  title: string;
  description: string;
  className?: string;
}

export function FeatureHint({ hintId, title, description, className }: FeatureHintProps) {
  const { data: user } = useUser();
  const dismissHint = useDismissHint();
  const [isVisible, setIsVisible] = useState(true);

  const isDismissed = user?.dismissedHints?.includes(hintId);

  if (isDismissed || !isVisible) return null;

  const handleDismiss = () => {
    dismissHint.mutate(hintId);
    setIsVisible(false);
  };

  return (
    <Card className={cn("border-primary/20 bg-primary/5", className)} data-testid={`hint-${hintId}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-full bg-primary/10 shrink-0 mt-0.5">
            <Lightbulb className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium mb-0.5">{title}</h4>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleDismiss}
            data-testid={`button-dismiss-hint-${hintId}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ResetOnboardingButton() {
  const { data: user } = useUser();
  const resetOnboarding = useCompleteOnboarding();

  if (!user?.onboardingCompleted) return null;

  const handleReset = async () => {
    const res = await fetch("/api/onboarding/reset", { method: "POST" });
    if (res.ok) {
      window.location.reload();
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleReset}
      className="gap-2"
      data-testid="button-reset-onboarding"
    >
      <RotateCcw className="h-4 w-4" />
      온보딩 다시 보기
    </Button>
  );
}
