#ifndef PHONG
#define PHONG

vec3 sampleSpecularLobe(float shininess) {
  float u1 = rand();
  float u2 = rand();
  float phi = 2.0 * PI * u2;
  float s = sqrt(1.0 - pow(u1, 2.0 / (shininess + 1.0)));
  
  float x = s * cos(phi);
  float y = s * sin(phi);
  float z = pow(u1, 2.0 / (shininess + 1.0));
  
  return vec3(x, y, z);
}

// evaluate BRDF
vec3 evalPhongBrdf(vec3 wi, vec3 wo, vec3 normal, vec3 diffuse, vec3 specular, float shininess) {
  vec3 kd = diffuse * INV_PI;
  
  vec3 perfectSpecular = reflect(wi, normal);
  float cosTheta = dot(perfectSpecular, wo);
  
  vec3 ks = specular * (shininess + 2.0) * INV_TWO_PI * pow(cosTheta, shininess);
  
  return kd + ks;
}

// importance sample BRDF
vec3 samplePhongBrdf(IsectInfo isect, vec3 diffuse, vec3 specular, float shininess, inout Ray ray, out float pdf) {
  // TODO: alter diffuse ratio
  if (rand() < 0.5) {
    vec3 wi = isect.tbn * cosineSampleHemisphere();
    float cosTheta = dot(isect.shadingNormal, wi);
    
    ray.origin = isect.point;
    ray.direction = wi;
    pdf = cosineHemispherePdf(cosTheta);
    
    return diffuse * INV_PI;
  } else {
    vec3 wi = isect.tbn * sampleSpecularLobe(shininess);
    vec3 perfectSpecular = reflect(isect.shadingNormal, wi);
    float cosTheta = abs(dot(perfectSpecular, -ray.direction));
    
    ray.origin = isect.point;
    ray.direction = wi;
    pdf = (shininess + 2.0) * INV_TWO_PI * pow(cosTheta, shininess);
    
    return specular * pdf;
  }
}

#endif // PHONG