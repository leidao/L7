#define LineTypeSolid 0.0
#define LineTypeDash 1.0
#define Animate 0.0
#define LineTexture 1.0

attribute vec4 a_Color;
attribute vec3 a_Position;
attribute vec4 a_Instance;
attribute float a_Size;
uniform mat4 u_ModelMatrix;
uniform mat4 u_Mvp;
uniform float segmentNumber;
uniform vec4 u_aimate: [ 0, 2., 1.0, 0.2 ];
varying vec4 v_color;
varying vec2 v_normal;

varying float v_distance_ratio;
uniform float u_line_type: 0.0;
uniform vec4 u_dash_array: [10.0, 5., 0, 0];
uniform float u_lineDir: 1.0;
varying vec4 v_dash_array;

uniform float u_icon_step: 100;
uniform float u_line_texture: 0.0;
varying float v_segmentIndex;
varying float v_arcDistrance;
varying float v_pixelLen;
varying float v_a;
varying vec2 v_offset;
attribute vec2 a_iconMapUV;
varying vec2 v_iconMapUV;

#pragma include "projection"
#pragma include "project"
#pragma include "picking"

float bezier3(vec3 arr, float t) {
  float ut = 1. - t;
  return (arr.x * ut + arr.y * t) * ut + (arr.y * ut + arr.z * t) * t;
}
vec2 midPoint(vec2 source, vec2 target) {
  vec2 center = target - source;
  float r = length(center);
  float theta = atan(center.y, center.x);
  float thetaOffset = 0.314;
  float r2 = r / 2.0 / cos(thetaOffset);
  float theta2 = theta + thetaOffset;
  vec2 mid = vec2(r2*cos(theta2) + source.x, r2*sin(theta2) + source.y);
  if(u_lineDir == 1.0) { // 正向
    return mid;
  } else { // 逆向
    // (mid + vmin)/2 = (s + t)/2
    vec2 vmid = source + target - mid;
    return vmid;
  }
  // return mid;
}
float getSegmentRatio(float index) {
    return smoothstep(0.0, 1.0, index / (segmentNumber - 1.));
}
vec2 interpolate (vec2 source, vec2 target, float t) {
  // if the angularDist is PI, linear interpolation is applied. otherwise, use spherical interpolation
  vec2 mid = midPoint(source, target);
  vec3 x = vec3(source.x, mid.x, target.x);
  vec3 y = vec3(source.y, mid.y, target.y);
  return vec2(bezier3(x ,t), bezier3(y,t));
}
vec2 getExtrusionOffset(vec2 line_clipspace, float offset_direction) {
  // normalized direction of the line
  vec2 dir_screenspace = normalize(line_clipspace);
  // rotate by 90 degrees
   dir_screenspace = vec2(-dir_screenspace.y, dir_screenspace.x);
  vec2 offset = dir_screenspace * offset_direction * setPickingSize(a_Size) / 2.0;
  return offset;
}
vec2 getNormal(vec2 line_clipspace, float offset_direction) {
  // normalized direction of the line
  vec2 dir_screenspace = normalize(line_clipspace);
  // rotate by 90 degrees
   dir_screenspace = vec2(-dir_screenspace.y, dir_screenspace.x);
   return reverse_offset_normal(vec3(dir_screenspace,1.0)).xy * sign(offset_direction);
}

void main() {
  v_color = a_Color;
  

  vec2 source = a_Instance.rg;
  vec2 target =  a_Instance.ba;
  float segmentIndex = a_Position.x;
  float segmentRatio = getSegmentRatio(segmentIndex);

  float indexDir = mix(-1.0, 1.0, step(segmentIndex, 0.0));
  float nextSegmentRatio = getSegmentRatio(segmentIndex + indexDir);
  if(u_line_type == LineTypeDash) {
      v_distance_ratio = segmentIndex / segmentNumber;
      vec2 s = source;
      vec2 t = target;
      
      if(u_CoordinateSystem == COORDINATE_SYSTEM_P20_2) { // gaode2.x
        s = unProjCustomCoord(source);
        t = unProjCustomCoord(target);
      }
      float total_Distance = pixelDistance(s, t) / 2.0 * PI;
      // float total_Distance = pixelDistance(a_Instance.rg, a_Instance.ba) / 2.0 * PI;
      v_dash_array = pow(2.0, 20.0 - u_Zoom) * u_dash_array / (total_Distance / segmentNumber * segmentIndex);
    }
  if(u_aimate.x == Animate) {
      v_distance_ratio = segmentIndex / segmentNumber;
      if(u_lineDir != 1.0) {
        v_distance_ratio = 1.0 - v_distance_ratio;
      }
  }
  vec4 curr = project_position(vec4(interpolate(source, target, segmentRatio), 0.0, 1.0));
  vec4 next = project_position(vec4(interpolate(source, target, nextSegmentRatio), 0.0, 1.0));
  v_normal = getNormal((next.xy - curr.xy) * indexDir, a_Position.y);
  //unProjCustomCoord
  
  vec2 offset = project_pixel(getExtrusionOffset((next.xy - curr.xy) * indexDir, a_Position.y));

  v_segmentIndex = a_Position.x + 1.0;
  if(LineTexture == u_line_texture) { // 开启贴图模式

    v_arcDistrance = length(source - target);
    v_iconMapUV = a_iconMapUV;
    v_pixelLen = project_pixel(u_icon_step);
    v_a = project_pixel(a_Size);
    v_offset = offset + offset * sign(a_Position.y);
  }
  

  // gl_Position = project_common_position_to_clipspace(vec4(curr.xy + offset, 0, 1.0));
  if(u_CoordinateSystem == COORDINATE_SYSTEM_P20_2) { // gaode2.x
    // gl_Position = u_Mvp * (vec4(curr.xy + offset, 0, 1.0));
    gl_Position = u_Mvp * (vec4(curr.xy + offset, 0, 1.0));
  } else {
    gl_Position = project_common_position_to_clipspace(vec4(curr.xy + offset, 0, 1.0));
  }
  setPickingColor(a_PickingColor);
}
