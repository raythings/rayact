/**
 * TypeScript declaration for CanvasRenderingContext2D
 */

export {};

declare global {
    interface CanvasRenderingContext2D {
        canvas: HTMLCanvasElement;
        fillStyle: string;
        strokeStyle: string;
        lineWidth: number;
        globalAlpha: number;
        beginPath(): void;
        closePath(): void;
        moveTo(x: number, y: number): void;
        lineTo(x: number, y: number): void;
        arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
        fill(): void;
        stroke(): void;
        rect(x: number, y: number, width: number, height: number): void;
        save(): void;
        restore(): void;
        translate(x: number, y: number): void;
        rotate(angle: number): void;
        clip(): void;
        clearRect(x: number, y: number, width: number, height: number): void;
    }
}

export {};
