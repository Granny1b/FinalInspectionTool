/**
 * Konva's core plus only the shapes this feature draws, instead of the whole library: react-konva's
 * core entry renders a shape only once its class has been imported (which registers it). Only the
 * lazily loaded editor imports this, so Konva stays out of the main bundle.
 */
import Konva from 'konva/lib/Core';
import { Arrow } from 'konva/lib/shapes/Arrow';
import { Ellipse } from 'konva/lib/shapes/Ellipse';
import { Image } from 'konva/lib/shapes/Image';
import { Line } from 'konva/lib/shapes/Line';
import { Rect } from 'konva/lib/shapes/Rect';
import { Text } from 'konva/lib/shapes/Text';
import { Transformer } from 'konva/lib/shapes/Transformer';

export { Arrow, Ellipse, Image, Konva, Line, Rect, Text, Transformer };
