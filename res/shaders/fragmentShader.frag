#version 330 core

#define MAX_STEPS 200
#define MAX_DIST 5000
#define SURF_DIST 0.01

#define N 1
#define LIGHT_COUNT 1
#define BH_index 0



//������ � ���
uniform vec2 u_camRot; // �������� ������ (���� yaw, pitch)
uniform vec3 u_camPos; // ������� ������
uniform vec2 u_resolution;
uniform sampler2D u_background;   // ������� �����������

//�������
uniform vec4 u_BH;
uniform vec4 u_Object;
uniform float u_time;

// ��������� ������������� �����
vec3 u_diskCenter = vec3(u_BH.x, u_BH.y, u_BH.z);       // ����� �����
float u_diskRInner = 50;      // ���������� ������ (���������)
float u_diskROuter = 150;      // ������� ������
float u_diskHalfHeight = 2;  // �������� ������� �� Y
vec3 BaseColor = vec3(0.99, 0.47, 0.01);

//�����
out vec4 FragColor;





//-----------------------------------������� ��������
//���������� ��  �������
struct objInfo 
{
    float dist;
    vec3 color;
	bool isLight;
};

#if N > 0
	vec4 spheres[N] = vec4[](u_BH);

	vec3 sphereColor[N] = vec3[](vec3(0.0, 0.0, 0.0));
#endif

#if LIGHT_COUNT > 0
	vec4 lightSrc[LIGHT_COUNT] = vec4[](u_Object);

	vec3 lightColor[LIGHT_COUNT] = vec3[](vec3(1.0, 0.81, 0.28));
#endif



//----------------------------���������� ������
vec3 toLinear(vec3 c) 
{
    return pow(c, vec3(2.2));
}

vec3 toGamma(vec3 c) 
{
    return pow(c, vec3(1.0 / 2.2));
}

vec3 mixColor(vec3 a, vec3 b, float t) 
{
    vec3 A = toLinear(a);
    vec3 B = toLinear(b);
    vec3 M = mix(A, B, t);
    return toGamma(M);
}


//-------------------------------����������������� ���--------------
// �������� hash
float hash(vec3 p) 
{
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// ����������� ������������ ��� �������� ����
float noise(vec3 x) 
{
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0, 0, 0)), 
                       hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), 
                       hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), 
                       hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), 
                       hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

//� �������� ����������
vec3 toPolar(vec3 p, vec3 center) 
{
    vec3 dir = p - center;
    float r = length(dir.xz);
    float y = dir.y;
    float phi = atan(dir.z, dir.x);
    return vec3(r, y, phi);
}

vec4 getGlow(float minPDist) 
{
    float mainGlow = minPDist * 1.2;
    mainGlow = pow(mainGlow, 32.0);
    mainGlow = clamp(mainGlow, 0.0, 1.0);
    float outerGlow = minPDist * 0.4;
    outerGlow = pow(outerGlow, 2.0);
    outerGlow = clamp(outerGlow, 0.0, 1.0);
    vec4 glow = vec4(10, 5, 3, mainGlow);
    glow += vec4(0, 0, 0, outerGlow);
    glow.a = min(glow.a, 1.0);
    return glow;
}



//----------------------------------------���-------------------
vec3 getBackgroundColor(vec3 rayDir) 
{
    // ����������� �������� rayDir � UV
    float u = atan(rayDir.z, rayDir.x) / (2.0 * 3.1415926) + 0.5;
    float v = rayDir.y * 0.5 + 0.5;
    return texture(u_background, vec2(u, v)).rgb;
}


//---------------------------------SDF ��� �����------------------
float sphereSDF(vec3 p, vec4 sphere)
{
    return length(p - sphere.xyz) - sphere.w;
}


//---------------------------------SDF ��� �����
float sdAccretionDisk(vec3 p, vec3 center, float rInner, float rOuter, float halfHeight)
{
    vec3 q = p - center;
    float radialDist = length(q.xz);
    float dOuter = radialDist - rOuter;
    float dInner = rInner - radialDist;
    float dVertical = abs(q.y) - halfHeight;

    float ringDist = max(max(dOuter, dVertical), dInner);
	
	//��������� ���
	if(ringDist < 10.0)
    {
		vec3 c = toPolar(p, center);
        c *= 0.5;
		c.z = sin(8 * c.z + 0.5 * u_time);
		c.x *= 0.3;
		float n = noise(c);
        ringDist += n * 4;
        ringDist += noise(c * 5) * 0.4;
		BaseColor = mix(vec3(0.99, 0.47, 0.01), vec3(1.0, 1.0, 1.0), n);
    }
	
    return ringDist;
}


//------------------------������� �������� ������ ��� Y
mat3 rotY(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(
        c, 0.0, -s,
        0.0, 1.0, 0.0,
        s, 0.0, c
    );
}


//--------------------------������� �������� ������ ��� X
mat3 rotX(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(
        1.0, 0.0, 0.0,
        0.0, c, s,
        0.0, -s, c
    );
}


//--------------------------------------------�����
objInfo map(vec3 p)
{
	objInfo obj;
	obj.dist = 1e9;
	obj.color = vec3(0.0);
	obj.isLight = false;
	
	int i;
	float d;
    for (i=0; i<N; i++)
    {
        d = sphereSDF(p, spheres[i]);
        if (d < obj.dist)
        {
            obj.dist = d;
            obj.color = sphereColor[i];
			obj.isLight = false;
        }
    }
	
	#if LIGHT_COUNT > 0
		for (i=0; i<LIGHT_COUNT; i++)
		{
			d = sphereSDF(p, lightSrc[i]);
			if (d < obj.dist)
			{
				obj.dist = d;
				
				//�������� 
				// �������� ���� � ��������� �� ����
				vec3 base = lightColor[i]; // �������, ������� ����� ���������
				float n = noise(p - lightSrc[i].xyz);
				n = clamp(n, 0.0, 1.0);
				obj.color = base * n + vec3(1.0) * (1.0 - n);
				
				obj.isLight = true;
			}
		}
	#endif
	
	// ������� ���� � �����
	float dDisk = sdAccretionDisk(p, u_diskCenter, u_diskRInner, u_diskROuter, u_diskHalfHeight);
	if (dDisk < obj.dist)
	{
		obj.dist = dDisk;
		obj.color = BaseColor;
		obj.isLight = true;
	}

    return obj;
}



//---------------------------------------RayMarching
objInfo RayMarch(vec3 ro, vec3 rd) 
{
	objInfo obj;
	obj.dist = 0.0;
	obj.color = vec3(0.0);
	obj.isLight = false;
	
	vec3 color = vec3(1.0, 0.96, 0.85);
	vec3 glow = vec3(0.0);
    
	int i, ii;
	float dO = 0.0;
	float minDist = 1e9;
	vec3 p = ro;
    for(i=0; i<MAX_STEPS; i++) 
	{
		obj = map(p);
        float dS = obj.dist;
		if(dS<SURF_DIST) break;
		
		//����������� ���������� �� ��������� �����
		if(minDist > dS && obj.isLight==true) 
		{	
			//color = obj.color;
			minDist = dS;
		}
		
		// ����������� ����
		vec3 toAttractor = spheres[BH_index].xyz - p; //������ � ����������
		vec3 DirtoAttractor = normalize(toAttractor); //����������� �� ���������
		float r = length(toAttractor); 
		//������� ����������� + ����������� �� ��������� * ���������;
		float bendFactor = 10 * dS / pow(r + 1.0, 2.0);
		rd = normalize(mix(rd, DirtoAttractor, bendFactor));
		
		dO += dS;
		p = p + rd*dS;
		
		if(dO>MAX_DIST) //���� ����
		{
			glow = color * exp(-minDist * 0.2); //��������� ���������
			obj.color = mix(glow, getBackgroundColor(rd), 0.5);
			break;
		}
    }
	
	//�������� �����
	// ����������� �� ����� �����
	vec3 toDisk = normalize(u_diskCenter - ro);
	// ��������� ������ ���������� � ������� �����
	float alignment = max(dot(rd, toDisk), 0.0);
	// �������������� �������� ���� � �����
	float proximity = exp(-minDist * 2.0);
	// ������������� �������� � ���������� ����� ��������
	float glare = pow(alignment, 8.0) * proximity;
	// Ҹ���� ����� ���� ��������
	vec3 glareColor = vec3(1.0, 0.96, 0.85) * glare * 2.5;
	// ��������� ������ � ��������� �����
	obj.color += glareColor;
	
	obj.dist = dO;
	
    return obj;
}





void main()
{
    // ����������� ���������� �������
	vec2 uv = (gl_FragCoord.xy-0.5*u_resolution.xy)/u_resolution.y;
	
	// ��������� ������
	vec3 ro = u_camPos;

	// ����������� ���� (��������� ���������� ������)
	vec3 rd = normalize(vec3(uv.x, uv.y, 1.0));

	// �������� ������
	mat3 rot = rotY(u_camRot.x) * rotX(u_camRot.y);
	rd = rot * rd;
	
    objInfo obj = RayMarch(ro, rd);
    
    FragColor = vec4(obj.color, 1.0);
}