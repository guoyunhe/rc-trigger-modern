import * as React from 'react';
import { useRef, useState } from 'react';
import Align from 'rc-align';
import useLayoutEffect from 'rc-util/lib/hooks/useLayoutEffect';
import type { RefAlign } from 'rc-align/lib/Align';
import type { CSSMotionProps, MotionEndEventHandler } from 'rc-motion';
import CSSMotion from 'rc-motion';
import classNames from 'classnames';
import type {
  Point,
  AlignType,
  StretchType,
  TransitionNameType,
  AnimationType,
} from '../interface';
import useVisibleStatus from './useVisibleStatus';
import { getMotion } from '../utils/legacyUtil';
import useStretchStyle from './useStretchStyle';

export interface PopupInnerProps {
  visible?: boolean;

  prefixCls: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  zIndex?: number;

  // Motion
  motion: CSSMotionProps;
  destroyPopupOnHide?: boolean;
  forceRender?: boolean;

  // Legacy Motion
  animation: AnimationType;
  transitionName: TransitionNameType;

  // Measure
  stretch?: StretchType;

  // Align
  align?: AlignType;
  point?: Point;
  getRootDomNode?: () => HTMLElement;
  getClassNameFromAlign?: (align: AlignType) => string;
  onAlign?: (element: HTMLElement, align: AlignType) => void;

  // Events
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
}

export interface PopupInnerRef {
  forceAlign: () => void;
  getElement: () => HTMLElement;
}

const PopupInner = React.forwardRef<PopupInnerRef, PopupInnerProps>(
  (props, ref) => {
    const {
      visible,

      prefixCls,
      className,
      style,
      children,
      zIndex,

      stretch,
      destroyPopupOnHide,
      forceRender,

      align,
      point,
      getRootDomNode,
      getClassNameFromAlign,
      onAlign,

      onMouseEnter,
      onMouseLeave,
      onMouseDown,
      onTouchStart,
    } = props;

    const alignRef = useRef<RefAlign>();
    const elementRef = useRef<HTMLDivElement>();

    const [alignedClassName, setAlignedClassName] = useState<string>();

    // ======================= Measure ========================
    const [stretchStyle, measureStretchStyle] = useStretchStyle(stretch);

    function doMeasure() {
      if (stretch) {
        measureStretchStyle(getRootDomNode());
      }
    }

    // ======================== Status ========================
    const [status, goNextStatus] = useVisibleStatus(visible, doMeasure);

    // ======================== Aligns ========================
    const [alignInfo, setAlignInfo] = useState<AlignType>(null);
    const prepareResolveRef = useRef<(value?: unknown) => void>();

    // `target` on `rc-align` can accept as a function to get the bind element or a point.
    // ref: https://www.npmjs.com/package/rc-align
    function getAlignTarget() {
      if (point) {
        return point;
      }
      return getRootDomNode;
    }

    function forceAlign() {
      alignRef.current?.forceAlign();
    }

    function onInternalAlign(popupDomNode: HTMLElement, matchAlign: AlignType) {
      const nextAlignedClassName = getClassNameFromAlign(matchAlign);
      if (alignedClassName !== nextAlignedClassName) {
        setAlignedClassName(nextAlignedClassName);
      }

      setAlignInfo(matchAlign);

      if (status === 'align') {
        onAlign?.(popupDomNode, matchAlign);
      }
    }

    // Delay to go to next status
    useLayoutEffect(() => {
      if (alignInfo && status === 'align') {
        const nextAlignedClassName = getClassNameFromAlign(alignInfo);

        // Repeat until not more align needed
        if (alignedClassName !== nextAlignedClassName) {
          forceAlign();
        } else {
          goNextStatus(function () {
            prepareResolveRef.current?.();
          });
        }
      }
    }, [alignInfo]);

    // ======================== Motion ========================
    const motion = { ...getMotion(props) };
    ['onAppearEnd', 'onEnterEnd', 'onLeaveEnd'].forEach((eventName) => {
      const originHandler: MotionEndEventHandler = motion[eventName];
      motion[eventName] = (element, event) => {
        goNextStatus();
        return originHandler?.(element, event);
      };
    });

    function onShowPrepare() {
      return new Promise((resolve) => {
        prepareResolveRef.current = resolve;
      });
    }

    // Go to stable directly when motion not provided
    React.useEffect(() => {
      if (!motion.motionName && status === 'motion') {
        goNextStatus();
      }
    }, [motion.motionName, status]);

    // ========================= Refs =========================
    React.useImperativeHandle(ref, () => ({
      forceAlign,
      getElement: () => elementRef.current,
    }));

    // ======================== Render ========================
    const mergedStyle: React.CSSProperties = {
      ...stretchStyle,
      zIndex,
      opacity:
        status === 'motion' || status === 'stable' || !visible ? undefined : 0,
      // Cannot interact with disappearing elements
      // https://github.com/ant-design/ant-design/issues/35051#issuecomment-1101340714
      pointerEvents: !visible && status !== 'stable' ? 'none' : undefined,
      ...style,
    };

    // Align status
    let alignDisabled = true;
    if (align?.points && (status === 'align' || status === 'stable')) {
      alignDisabled = false;
    }

    let childNode = children;

    // Wrapper when multiple children
    if (React.Children.count(children) > 1) {
      childNode = <div className={`${prefixCls}-content`}>{children}</div>;
    }

    return (
      <CSSMotion
        visible={visible}
        ref={elementRef}
        leavedClassName={`${prefixCls}-hidden`}
        {...motion}
        onAppearPrepare={onShowPrepare}
        onEnterPrepare={onShowPrepare}
        removeOnLeave={destroyPopupOnHide}
        forceRender={forceRender}
      >
        {({ className: motionClassName, style: motionStyle }, motionRef) => {
          const mergedClassName = classNames(
            prefixCls,
            className,
            alignedClassName,
            motionClassName,
          );

          return (
            <Align
              target={getAlignTarget()}
              key="popup"
              ref={alignRef}
              monitorWindowResize
              disabled={alignDisabled}
              align={align}
              onAlign={onInternalAlign}
            >
              <div
                ref={motionRef}
                className={mergedClassName}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onMouseDownCapture={onMouseDown}
                onTouchStartCapture={onTouchStart}
                style={{
                  ...motionStyle,
                  ...mergedStyle,
                }}
              >
                {childNode}
              </div>
            </Align>
          );
        }}
      </CSSMotion>
    );
  },
);

PopupInner.displayName = 'PopupInner';

export default PopupInner;
