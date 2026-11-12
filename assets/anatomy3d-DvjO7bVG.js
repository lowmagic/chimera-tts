import{m as e}from"./engine-CCPDcK_U.js";import{b as t,o as n,v as r,x as i,y as a}from"./vector-CAkclLPB.js";import{Ao as o,Hs as s,Ms as c,Or as l,Rn as u,Sn as d,U as f,Us as p,Vo as m,Ws as h,Xn as g,Zn as _,ai as v,an as y,bn as b,ec as x,ei as S,i as C,ir as w,ko as T,mn as E,r as D,ra as O,ri as k,va as A}from"./three.module-BB-a7dxZ.js";var j=(e,t)=>Math.hypot(e.x-t.x,e.y-t.y),M=(e,t,n)=>{let r=Math.sin(n),i=Math.cos(n),a=e.x-t.x,o=e.y-t.y;return{x:t.x+a*i-o*r,y:t.y+a*r+o*i}};function N(e,t){if(e.length<3)return e.slice();let n=[];for(let r=0;r<e.length-1;r++){let i=e[Math.max(0,r-1)],a=e[r],o=e[r+1],s=e[Math.min(e.length-1,r+2)];for(let e=0;e<t;e++){let r=e/t,c=r*r,l=c*r;n.push({x:.5*(2*a.x+(-i.x+o.x)*r+(2*i.x-5*a.x+4*o.x-s.x)*c+(-i.x+3*a.x-3*o.x+s.x)*l),y:.5*(2*a.y+(-i.y+o.y)*r+(2*i.y-5*a.y+4*o.y-s.y)*c+(-i.y+3*a.y-3*o.y+s.y)*l)})}}return n.push(e[e.length-1]),n}var P=new f,F=new p,I=class extends g{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type=`LineSegmentsGeometry`,this.setIndex([0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5]),this.setAttribute(`position`,new b([-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],3)),this.setAttribute(`uv`,new b([-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],2))}applyMatrix4(e){let t=this.attributes.instanceStart,n=this.attributes.instanceEnd;return t!==void 0&&(t.applyMatrix4(e),n.applyMatrix4(e),t.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new _(t,6,1);return this.setAttribute(`instanceStart`,new w(n,3,0)),this.setAttribute(`instanceEnd`,new w(n,3,3)),this.instanceCount=this.attributes.instanceStart.count,this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new _(t,6,1);return this.setAttribute(`instanceColorStart`,new w(n,3,0)),this.setAttribute(`instanceColorEnd`,new w(n,3,3)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new x(e.geometry)),this}fromLineSegments(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new f);let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;e!==void 0&&t!==void 0&&(this.boundingBox.setFromBufferAttribute(e),P.setFromBufferAttribute(t),this.boundingBox.union(P))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new m),this.boundingBox===null&&this.computeBoundingBox();let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(e!==void 0&&t!==void 0){let n=this.boundingSphere.center;this.boundingBox.getCenter(n);let r=0;for(let i=0,a=e.count;i<a;i++)F.fromBufferAttribute(e,i),r=Math.max(r,n.distanceToSquared(F)),F.fromBufferAttribute(t,i),r=Math.max(r,n.distanceToSquared(F));this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error(`THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.`,this)}}toJSON(){}};C.line={worldUnits:{value:1},linewidth:{value:1},resolution:{value:new s},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}},D.line={uniforms:c.merge([C.common,C.fog,C.line]),vertexShader:`
		#include <common>
		#include <color_pars_vertex>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>
		#include <clipping_planes_pars_vertex>

		uniform float linewidth;
		uniform vec2 resolution;

		attribute vec3 instanceStart;
		attribute vec3 instanceEnd;

		attribute vec3 instanceColorStart;
		attribute vec3 instanceColorEnd;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#ifdef USE_DASH

			uniform float dashScale;
			attribute float instanceDistanceStart;
			attribute float instanceDistanceEnd;
			varying float vLineDistance;

		#endif

		float trimSegmentAlpha( const in vec4 start, const in vec4 end ) {

			// compute the interpolation factor needed to trim the segment so it terminates
			// between the camera plane and the near plane

			// conservative estimate of the near plane
			float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
			float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column

			// we need different nearEstimate formula for reversed and default depth buffer
			// a is positive with a reversed depth buffer so it can be used for controlling the code flow
			float nearEstimate = ( a > 0.0 ) ? ( - b / ( a + 1.0 ) ) : ( - 0.5 * b / a );

			return ( nearEstimate - start.z ) / ( end.z - start.z );

		}

		void main() {

			#ifdef USE_COLOR

				vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

			#endif

			float aspect = resolution.x / resolution.y;

			// camera space
			vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

			#ifdef USE_DASH

				float lineDistanceStart = dashScale * instanceDistanceStart;
				float lineDistanceEnd = dashScale * instanceDistanceEnd;

			#endif

			#ifdef WORLD_UNITS

				worldStart = start.xyz;
				worldEnd = end.xyz;

			#else

				vUv = uv;

			#endif

			// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
			// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
			// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
			// perhaps there is a more elegant solution -- WestLangley

			bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

			if ( perspective ) {

				if ( start.z < 0.0 && end.z >= 0.0 ) {

					float alpha = trimSegmentAlpha( start, end );
					end.xyz = mix( start.xyz, end.xyz, alpha );

					#ifdef USE_DASH

						lineDistanceEnd = mix( lineDistanceStart, lineDistanceEnd, alpha );

					#endif

				} else if ( end.z < 0.0 && start.z >= 0.0 ) {

					float alpha = trimSegmentAlpha( end, start );
					start.xyz = mix( end.xyz, start.xyz, alpha );

					#ifdef USE_DASH

						lineDistanceStart = mix( lineDistanceEnd, lineDistanceStart, alpha );

					#endif

				}

			}

			#ifdef USE_DASH

				vLineDistance = ( position.y < 0.5 ) ? lineDistanceStart : lineDistanceEnd;
				vUv = uv;

			#endif

			// clip space
			vec4 clipStart = projectionMatrix * start;
			vec4 clipEnd = projectionMatrix * end;

			// ndc space
			vec3 ndcStart = clipStart.xyz / clipStart.w;
			vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

			// direction
			vec2 dir = ndcEnd.xy - ndcStart.xy;

			// account for clip-space aspect ratio
			dir.x *= aspect;
			dir = normalize( dir );

			#ifdef WORLD_UNITS

				vec3 worldDir = normalize( end.xyz - start.xyz );
				vec3 tmpFwd = normalize( mix( start.xyz, end.xyz, 0.5 ) );
				vec3 worldUp = normalize( cross( worldDir, tmpFwd ) );
				vec3 worldFwd = cross( worldDir, worldUp );
				worldPos = position.y < 0.5 ? start: end;

				// height offset
				float hw = linewidth * 0.5;
				worldPos.xyz += position.x < 0.0 ? hw * worldUp : - hw * worldUp;

				// don't extend the line if we're rendering dashes because we
				// won't be rendering the endcaps
				#ifndef USE_DASH

					// cap extension
					worldPos.xyz += position.y < 0.5 ? - hw * worldDir : hw * worldDir;

					// add width to the box
					worldPos.xyz += worldFwd * hw;

					// endcaps
					if ( position.y > 1.0 || position.y < 0.0 ) {

						worldPos.xyz -= worldFwd * 2.0 * hw;

					}

				#endif

				// project the worldpos
				vec4 clip = projectionMatrix * worldPos;

				// shift the depth of the projected points so the line
				// segments overlap neatly
				vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
				clip.z = clipPose.z * clip.w;

			#else

				vec2 offset = vec2( dir.y, - dir.x );
				// undo aspect ratio adjustment
				dir.x /= aspect;
				offset.x /= aspect;

				// sign flip
				if ( position.x < 0.0 ) offset *= - 1.0;

				// endcaps
				if ( position.y < 0.0 ) {

					offset += - dir;

				} else if ( position.y > 1.0 ) {

					offset += dir;

				}

				// adjust for linewidth
				offset *= linewidth;

				// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
				offset /= resolution.y;

				// select end
				vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

				// back to clip space
				offset *= clip.w;

				clip.xy += offset;

			#endif

			gl_Position = clip;

			vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

			#include <logdepthbuf_vertex>
			#include <clipping_planes_vertex>
			#include <fog_vertex>

		}
		`,fragmentShader:`
		uniform vec3 diffuse;
		uniform float opacity;
		uniform float linewidth;

		#ifdef USE_DASH

			uniform float dashOffset;
			uniform float dashSize;
			uniform float gapSize;

		#endif

		varying float vLineDistance;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#include <common>
		#include <color_pars_fragment>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>
		#include <clipping_planes_pars_fragment>

		vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

			float mua;
			float mub;

			vec3 p13 = p1 - p3;
			vec3 p43 = p4 - p3;

			vec3 p21 = p2 - p1;

			float d1343 = dot( p13, p43 );
			float d4321 = dot( p43, p21 );
			float d1321 = dot( p13, p21 );
			float d4343 = dot( p43, p43 );
			float d2121 = dot( p21, p21 );

			float denom = d2121 * d4343 - d4321 * d4321;

			float numer = d1343 * d4321 - d1321 * d4343;

			mua = numer / denom;
			mua = clamp( mua, 0.0, 1.0 );
			mub = ( d1343 + d4321 * ( mua ) ) / d4343;
			mub = clamp( mub, 0.0, 1.0 );

			return vec2( mua, mub );

		}

		void main() {

			float alpha = opacity;
			vec4 diffuseColor = vec4( diffuse, alpha );

			#include <clipping_planes_fragment>

			#ifdef USE_DASH

				if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

				if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

			#endif

			#ifdef WORLD_UNITS

				// Find the closest points on the view ray and the line segment
				vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
				vec3 lineDir = worldEnd - worldStart;
				vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

				vec3 p1 = worldStart + lineDir * params.x;
				vec3 p2 = rayEnd * params.y;
				vec3 delta = p1 - p2;
				float len = length( delta );
				float norm = len / linewidth;

				#ifndef USE_DASH

					#ifdef USE_ALPHA_TO_COVERAGE

						float dnorm = fwidth( norm );
						alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

					#else

						if ( norm > 0.5 ) {

							discard;

						}

					#endif

				#endif

			#else

				#ifdef USE_ALPHA_TO_COVERAGE

					// artifacts appear on some hardware if a derivative is taken within a conditional
					float a = vUv.x;
					float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
					float len2 = a * a + b * b;
					float dlen = fwidth( len2 );

					if ( abs( vUv.y ) > 1.0 ) {

						alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

					}

				#else

					if ( abs( vUv.y ) > 1.0 ) {

						float a = vUv.x;
						float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
						float len2 = a * a + b * b;

						if ( len2 > 1.0 ) discard;

					}

				#endif

			#endif

			#include <logdepthbuf_fragment>
			#include <color_fragment>

			gl_FragColor = vec4( diffuseColor.rgb, alpha );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			#include <fog_fragment>
			#include <premultiplied_alpha_fragment>

		}
		`};var L=class extends o{constructor(e){super({type:`LineMaterial`,uniforms:c.clone(D.line.uniforms),vertexShader:D.line.vertexShader,fragmentShader:D.line.fragmentShader,clipping:!0}),this.isLineMaterial=!0,this.setValues(e)}get color(){return this.uniforms.diffuse.value}set color(e){this.uniforms.diffuse.value=e}get worldUnits(){return`WORLD_UNITS`in this.defines}set worldUnits(e){e===!0!==this.worldUnits&&(this.needsUpdate=!0),e===!0?this.defines.WORLD_UNITS=``:delete this.defines.WORLD_UNITS}get linewidth(){return this.uniforms.linewidth.value}set linewidth(e){this.uniforms.linewidth&&(this.uniforms.linewidth.value=e)}get dashed(){return`USE_DASH`in this.defines}set dashed(e){e===!0!==this.dashed&&(this.needsUpdate=!0),e===!0?this.defines.USE_DASH=``:delete this.defines.USE_DASH}get dashScale(){return this.uniforms.dashScale.value}set dashScale(e){this.uniforms.dashScale.value=e}get dashSize(){return this.uniforms.dashSize.value}set dashSize(e){this.uniforms.dashSize.value=e}get dashOffset(){return this.uniforms.dashOffset.value}set dashOffset(e){this.uniforms.dashOffset.value=e}get gapSize(){return this.uniforms.gapSize.value}set gapSize(e){this.uniforms.gapSize.value=e}get opacity(){return this.uniforms.opacity.value}set opacity(e){this.uniforms&&(this.uniforms.opacity.value=e)}get resolution(){return this.uniforms.resolution.value}set resolution(e){this.uniforms.resolution.value.copy(e)}get alphaToCoverage(){return`USE_ALPHA_TO_COVERAGE`in this.defines}set alphaToCoverage(e){this.defines&&(e===!0!==this.alphaToCoverage&&(this.needsUpdate=!0),e===!0?this.defines.USE_ALPHA_TO_COVERAGE=``:delete this.defines.USE_ALPHA_TO_COVERAGE)}},R=new h,ee=new p,te=new p,z=new h,B=new h,V=new h,ne=new p,re=new k,H=new l,ie=new p,U=new f,W=new m,G=new h,K,q;function ae(e,t,n){return G.set(0,0,-t,1).applyMatrix4(e.projectionMatrix),G.multiplyScalar(1/G.w),G.x=q/n.width,G.y=q/n.height,G.applyMatrix4(e.projectionMatrixInverse),G.multiplyScalar(1/G.w),Math.abs(Math.max(G.x,G.y))}function oe(e,t){let n=e.matrixWorld,r=e.geometry,i=r.attributes.instanceStart,a=r.attributes.instanceEnd,o=Math.min(r.instanceCount,i.count);for(let r=0,s=o;r<s;r++){H.start.fromBufferAttribute(i,r),H.end.fromBufferAttribute(a,r),H.applyMatrix4(n);let o=new p,s=new p;K.distanceSqToSegment(H.start,H.end,s,o),s.distanceTo(o)<q*.5&&t.push({point:s,pointOnLine:o,distance:K.origin.distanceTo(s),object:e,face:null,faceIndex:r,uv:null,uv1:null})}}function se(e,t,n){let r=t.projectionMatrix,i=e.material.resolution,a=e.matrixWorld,o=e.geometry,s=o.attributes.instanceStart,c=o.attributes.instanceEnd,l=Math.min(o.instanceCount,s.count),u=-t.near;K.at(1,V),V.w=1,V.applyMatrix4(t.matrixWorldInverse),V.applyMatrix4(r),V.multiplyScalar(1/V.w),V.x*=i.x/2,V.y*=i.y/2,V.z=0,ne.copy(V),re.multiplyMatrices(t.matrixWorldInverse,a);for(let t=0,o=l;t<o;t++){if(z.fromBufferAttribute(s,t),B.fromBufferAttribute(c,t),z.w=1,B.w=1,z.applyMatrix4(re),B.applyMatrix4(re),z.z>u&&B.z>u)continue;if(z.z>u){let e=z.z-B.z,t=(z.z-u)/e;z.lerp(B,t)}else if(B.z>u){let e=B.z-z.z,t=(B.z-u)/e;B.lerp(z,t)}z.applyMatrix4(r),B.applyMatrix4(r),z.multiplyScalar(1/z.w),B.multiplyScalar(1/B.w),z.x*=i.x/2,z.y*=i.y/2,B.x*=i.x/2,B.y*=i.y/2,H.start.copy(z),H.start.z=0,H.end.copy(B),H.end.z=0;let o=H.closestPointToPointParameter(ne,!0);H.at(o,ie);let l=S.lerp(z.z,B.z,o),d=l>=-1&&l<=1,f=ne.distanceTo(ie)<q*.5;if(d&&f){H.start.fromBufferAttribute(s,t),H.end.fromBufferAttribute(c,t),H.start.applyMatrix4(a),H.end.applyMatrix4(a);let r=new p,i=new p;K.distanceSqToSegment(H.start,H.end,i,r),n.push({point:i,pointOnLine:r,distance:K.origin.distanceTo(i),object:e,face:null,faceIndex:t,uv:null,uv1:null})}}}var ce=class extends v{constructor(e=new I,t=new L({color:Math.random()*16777215})){super(e,t),this.isLineSegments2=!0,this.type=`LineSegments2`}computeLineDistances(){let e=this.geometry,t=e.attributes.instanceStart,n=e.attributes.instanceEnd,r=new Float32Array(2*t.count);for(let e=0,i=0,a=t.count;e<a;e++,i+=2)ee.fromBufferAttribute(t,e),te.fromBufferAttribute(n,e),r[i]=i===0?0:r[i-1],r[i+1]=r[i]+ee.distanceTo(te);let i=new _(r,2,1);return e.setAttribute(`instanceDistanceStart`,new w(i,1,0)),e.setAttribute(`instanceDistanceEnd`,new w(i,1,1)),this}raycast(e,t){let n=this.material.worldUnits,r=e.camera;if(r===null&&!n&&console.error(`LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.`),n===!1&&(this.material.resolution.x===0||this.material.resolution.y===0))return;let i=e.params.Line2===void 0?0:e.params.Line2.threshold||0;K=e.ray;let a=this.matrixWorld,o=this.geometry,s=this.material;q=s.linewidth+i,o.boundingSphere===null&&o.computeBoundingSphere(),W.copy(o.boundingSphere).applyMatrix4(a);let c;if(c=n?q*.5:ae(r,Math.max(r.near,W.distanceToPoint(K.origin)),s.resolution),W.radius+=c,K.intersectsSphere(W)===!1)return;o.boundingBox===null&&o.computeBoundingBox(),U.copy(o.boundingBox).applyMatrix4(a);let l;l=n?q*.5:ae(r,Math.max(r.near,U.distanceToPoint(K.origin)),s.resolution),U.expandByScalar(l),K.intersectsBox(U)!==!1&&(n?oe(this,t):se(this,r,t))}onBeforeRender(e){let t=this.material.uniforms;t&&t.resolution&&(e.getViewport(R),this.material.uniforms.resolution.value.set(R.z,R.w))}},J=[.6,.85,1.05,1.3,1.6,2.1],le=class{a=new Float32Array(768);n=0;reset(){return this.n=0,this}p(e,t,n){if(3*this.n+3>this.a.length){let e=new Float32Array(this.a.length*2);e.set(this.a),this.a=e}let r=3*this.n++;return this.a[r]=e,this.a[r+1]=t,this.a[r+2]=n,this}},ue=class{material;mesh;geo=new I;pos=new Float32Array;col=new Float32Array;pb=null;cb=null;cap=0;n=0;constructor(e){this.material=e,this.mesh=new ce(this.geo,e),this.mesh.frustumCulled=!1,this.grow(2048)}grow(e){let t=new Float32Array(e*6),n=new Float32Array(e*6);t.set(this.pos.subarray(0,this.n*6)),n.set(this.col.subarray(0,this.n*6)),this.pos=t,this.col=n,this.cap=e,this.geo.dispose(),this.geo=new I;let r=this.pb=new _(t,6,1).setUsage(y),i=this.cb=new _(n,6,1).setUsage(y);this.geo.setAttribute(`instanceStart`,new w(r,3,0)),this.geo.setAttribute(`instanceEnd`,new w(r,3,3)),this.geo.setAttribute(`instanceColorStart`,new w(i,3,0)),this.geo.setAttribute(`instanceColorEnd`,new w(i,3,3)),this.mesh.geometry=this.geo}seg(e,t,n,r,i,a,o,s,c){this.n>=this.cap&&this.grow(this.cap*2);let l=this.n++*6,u=this.pos,d=this.col;u[l]=e,u[l+1]=t,u[l+2]=n,u[l+3]=r,u[l+4]=i,u[l+5]=a,d[l]=d[l+3]=o,d[l+1]=d[l+4]=s,d[l+2]=d[l+5]=c}commit(){this.geo.instanceCount=this.n,this.mesh.visible=this.n>0;for(let e of[this.pb,this.cb])e.clearUpdateRanges(),e.addUpdateRange(0,this.n*6),e.needsUpdate=!0}dispose(){this.geo.dispose(),this.material.dispose()}},de=new Map;function fe(e){let t=de.get(e);if(!t){let n=parseInt(e.slice(1),16);t=[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255],de.set(e,t)}return t}var pe=class{group=new u;batches;constructor(){this.batches=J.map(e=>{let t=new L({linewidth:e,vertexColors:!0,transparent:!0,depthTest:!1,depthWrite:!1,toneMapped:!1});t.blending=5,t.blendEquation=104,t.fog=!0;let n=new ue(t);return this.group.add(n.mesh),n})}setResolution(e,t){for(let n of this.batches)n.material.resolution.set(e,t)}begin(){for(let e of this.batches)e.n=0}end(){for(let e of this.batches)e.commit()}batch(e){let t=0;for(let n=1;n<J.length;n++)Math.abs(J[n]-e)<Math.abs(J[t]-e)&&(t=n);return this.batches[t]}line(e,t,n,r,i={}){if(t<2)return;let o=i.alpha??1;this.strokes(e,t,fe(n),o,this.batch(r),i.close??!1),i.hot&&this.strokes(e,t,fe(a(n)),o,this.batch(r*.42),i.close??!1)}poly(e,t,n,r={}){this.line(e.a,e.n,t,n,r)}seg(e,t,n,r,i,a,o,s,c=1){let[l,u,d]=fe(o);this.batch(s).seg(e,t,n,r,i,a,l*c,u*c,d*c)}strokes(e,t,[n,r,i],a,o,s){n*=a,r*=a,i*=a;for(let a=0;a<t-1;a++){let t=3*a;o.seg(e[t],e[t+1],e[t+2],e[t+3],e[t+4],e[t+5],n,r,i)}if(s){let a=3*(t-1);o.seg(e[a],e[a+1],e[a+2],e[0],e[1],e[2],n,r,i)}}dispose(){for(let e of this.batches)e.dispose()}};function me(e,t){let n=e.tract;return-Math.max(-.2,Math.min(3,t))*n.scale/j(n.P(-2.5,10.5),n.P(6.95,7.75))}function he(e,t){let n=e.tract,r=n.P(-2.5,10.5),i=me(e,t.jaw);return(e,t)=>M(n.P(e,t),r,i)}function ge(e,t,n,r=0,i=40){let a=Math.cos(-r),o=Math.sin(-r),s=[];for(let r=0;r<=i;r++){let c=r/i*Math.PI*2,l=Math.cos(c)*t,u=Math.sin(c)*n;s.push({x:e.x+l*a-u*o,y:e.y+l*o+u*a})}return s}function _e(e,t,n){let r=Math.min(e.x,t.x),i=Math.max(e.x,t.x),a=Math.min(e.y,t.y),o=Math.max(e.y,t.y),s=Math.min(n,(i-r)/2,(o-a)/2),c=[],l=(e,t,n)=>{for(let r=0;r<=6;r++){let i=n+r/6*(Math.PI/2);c.push({x:e+Math.cos(i)*s,y:t+Math.sin(i)*s})}};return l(i-s,o-s,0),l(r+s,o-s,Math.PI/2),l(r+s,a+s,Math.PI),l(i-s,a+s,3*Math.PI/2),c.push(c[0]),c}var ve=e=>-1.2-.025*e;function ye(e){let t=e.tract.scale,n=e.bodyParams.pharynx;return(e,r)=>({x:e*t,y:(r<7?7-(7-r)*n:r)*t})}function be(e,t,n){let r=e.tract,i=(e,t)=>r.P(e,t),a=he(e,n),o=r.scale,s=n.larynx*o,c=ye(e),l=t.upperLip.slice(7),u=t.lowerLip.slice(7),d=N([c(2.3,-4.6),c(2.38,-1.5),c(2.52,.4),c(3,1.7),a(5.3,3),a(7.25,3.35),a(7.95,4.6),a(7.55,5.7)],4),f=N([l[l.length-1],c(7.05,10.6),c(7.75,10.78),c(8.75,11.05),c(9.25,11.65),c(8.95,12.6),c(8.35,13.9),c(7.7,15),c(7.95,16.1),c(7.9,18.1),c(6.9,20.5)],4),p=N([c(6.9,20.5),c(3,22.9),c(-2.2,22.7),c(-6.9,19.6),c(-8.7,15.4),c(-8.3,11.9),c(-7.4,8.9),c(-6.8,4.8),c(-6.6,0),c(-6.6,-4.6)],4),m=[];for(let e=0;e<9;e++){let t=-4.4+e*1.75;if(t>10.5)break;let n=ve(t)-2.25;m.push(_e(i(n,t+1.4),i(n+1.6,t),.32*o))}let h=[[1,9.6],[1.8,9.92],[2.7,10.18],[3.6,10.3],[4.4,10.25],[5.1,10.05],[5.7,9.72],[6.15,9.36],[6.55,9.15],[7,9.6]].map(([e,t])=>r.P(e,t)),g=t.jawBone.filter(e=>e.x>.8*o),_=t.glottis,v={x:i(1.6,0).x,y:i(0,2.9).y+.6*s},y=[];for(let e=0;e<4;e++){let t=_.y-(.9+e*1)*o;if(t<-4.4)break;y.push([{x:_.x+.8*o,y:t},{x:_.x+1.05*o,y:t-.05},{x:_.x+1.05*o,y:t-.5*o},{x:_.x+.82*o,y:t-.45*o},{x:_.x+.8*o,y:t}])}let b=a(6,5.45),x=t.tongueCenter,S=[];for(let e=0;e<=16;e++){let n=Math.PI*(.18+.9*e/16),r={x:x.x+Math.cos(n)*t.tongueRadius*1.25,y:x.y+Math.sin(n)*t.tongueRadius*1.25},i={x:x.x,y:(x.y+b.y)/2},a=[];for(let e=0;e<=12;e++){let t=e/12;a.push({x:(1-t)*(1-t)*b.x+2*(1-t)*t*i.x+t*t*r.x,y:(1-t)*(1-t)*b.y+2*(1-t)*t*i.y+t*t*r.y})}S.push(a)}let C={x:ve(_.y/o)*o,y:_.y};return{f:t,model:e,skinLower:[...d,...u.slice().reverse()],skinUpper:[...l,...f.slice(1),...p.slice(1)],inset:N([c(1.85,-4.6),c(1.9,-.8),c(2.3,1.6),a(5.2,3.6),a(6.9,3.9),a(7.4,4.9),a(7.2,5.9),c(6.6,9.9),c(7.6,10.9),c(8.55,11.5),c(8.1,13.4),c(7.25,15.2),c(7.45,18),c(3,22.2),c(-2,22),c(-6.3,19.2),c(-7.9,15.3),c(-7.6,12),c(-6.7,8.7),c(-6.1,4.6),c(-6,-4.6)],3),skull:N([c(7,16.2),c(7.3,18.5),c(6,20.7),c(3,22.1),c(-2,22),c(-6.3,19.2),c(-7.9,15.3),c(-7.4,12.6),c(-4.6,12.2),c(-2.2,13.3),c(1,13.7),c(4.1,14.1),c(6.2,14.9)],4),brain:N([c(6.55,16.3),c(6.75,18.4),c(5.5,20.1),c(2.8,21.4),c(-1.9,21.3),c(-5.8,18.8),c(-7.1,15.4),c(-6.7,13.1),c(-4.4,12.8),c(-2.1,13.9),c(1,14.3),c(4,14.7),c(5.9,15.4)],4),sulcus:N([c(5.4,19.4),c(2.4,20.5),c(-1.4,20.4),c(-4.8,18.4)],4),eye:ge(c(6.5,15.4),1.1*o,.95*o),eyeC:c(6.5,15.4),vertebrae:m,cords:[[i(-5.3,-4.6),i(-4.5,-4.6),i(-4.5,11.8),i(-5.1,12.4),i(-5.6,11.6)],[i(-5.1,-4.6),i(-4.7,-4.6),i(-4.72,11.4),i(-5.15,11.6)]],nasal:N([c(.3,11.2),c(1.1,10.25),c(2.7,10.75),c(4.6,10.85),c(6.4,10.65),c(7.6,10.85),c(8.45,11.3),c(8,12.2),c(6.7,13.4),c(4.4,13.9),c(1.8,13.6),c(.2,12.6)],4),turbinates:[[3,11.45,2.1,.32],[3.5,12.45,1.9,.3],[4,13.3,1.45,.22]].map(([e,t,n,r])=>ge(c(e,t),n*o,r*o,-.04)),palOral:h,palNasal:h.map(e=>({x:e.x,y:e.y+.55*o})),jawLower:g,jawUpper:g.map(e=>({x:e.x,y:e.y+.75*o})),hyoid:ge(v,.5*o,.28*o,.3,28),thyroid:[{x:_.x+.75*o,y:_.y-1.6*o},{x:_.x+1.75*o,y:_.y-.6*o},{x:_.x+1.95*o,y:_.y+1.2*o},{x:_.x+1.45*o,y:_.y+1.9*o},{x:_.x+1.15*o,y:_.y+1.1*o},{x:_.x+1.3*o,y:_.y-.4*o},{x:_.x+.75*o,y:_.y-1.6*o}],trachea:[[{x:_.x-.65*o,y:_.y},{x:_.x-.75*o,y:-4.8}],[{x:_.x+.75*o,y:_.y},{x:_.x+.95*o,y:-4.8}]],rings:y,outerWall:t.outer.filter(e=>e.y>_.y||e.x>0),glottisWall:[C,t.outer.find(e=>e.y>_.y)??C],fibres:S,folds:[[{x:_.x-.62*o,y:_.y+.05},{x:_.x-.1,y:_.y+.12*o},{x:_.x-.62*o,y:_.y+.32*o},{x:_.x-.62*o,y:_.y+.05}],[{x:_.x+.72*o,y:_.y+.05},{x:_.x+.12,y:_.y+.12*o},{x:_.x+.72*o,y:_.y+.32*o},{x:_.x+.72*o,y:_.y+.05}]],lowerTeeth:[...t.lowerTeeth,a(6.8,6),a(6.4,6.2),t.lowerTeeth[0]]}}var xe=class{pitch=0;yaw=0;toPitch=0;toYaw=0;next=2;update(e,t){if(e>=this.next){let t=Math.random()<.35;this.toPitch=t?0:(Math.random()*2-1)*.55,this.toYaw=t?0:(Math.random()*2-1)*.9,this.next=e+1.2+Math.random()*3.5}let n=1-Math.exp(-t*28);this.pitch+=(this.toPitch-this.pitch)*n,this.yaw+=(this.toYaw-this.yaw)*n}},Se=980.665,Ce=(e,t,n)=>{let r=Math.max(0,Math.min(1,(n-e)/(t-e)));return r*r*(3-2*r)},we=(e,t,n)=>Math.max(t,Math.min(n,e)),Te=(e,t,n,r)=>e+(t-e)*(1-Math.exp(-r/n)),Ee=class{hz;damping;x=0;v=0;constructor(e,t){this.hz=e,this.damping=t}step(e,t){let n=2*Math.PI*this.hz,r=Math.max(1,Math.ceil(t/.008)),i=t/r;for(let t=0;t<r;t++)this.v+=(n*n*(e-this.x)-2*this.damping*n*this.v)*i,this.x+=this.v*i;return this.x}};function De(e){let t=e.t.pressureRms,n=e.nPh+e.nOr-3;return n>=e.nPh&&n<t.length?t[n]/Se:0}var Oe=class{puff=0;brow=0;lid=0;lookUp=0;content=0;nod=0;tilt=0;clock=0;cheeks=new Ee(6.5,.32);nodSpring=new Ee(2.4,.42);tiltSpring=new Ee(3.2,.3);ref=NaN;fast=NaN;held=0;hold=0;nextBlink=1.5+Math.random()*2;blinkAt=-1;secondBlink=!1;lastStep=-1;update(e,t){this.clock+=t;let n=e?.t,r=!!n&&n.voicing>.45&&n.gate>.3&&n.f0>30&&n.outRms>.004,i=e?Ce(1.5,7,De(e)):0;this.puff=we(this.cheeks.step(i,t),-.35,1.25);let a=0,o=0;if(r){let e=Math.log2(n.f0);(!Number.isFinite(this.ref)||Math.abs(12*(e-this.ref))>14)&&(this.ref=this.fast=e),this.ref=Te(this.ref,e,5,t),Math.abs(12*(e-this.fast))>2.5&&(this.fast=e,this.held=0),this.fast=Te(this.fast,e,.35,t),this.held+=t,a=12*(e-this.ref),o=12*(e-this.fast)}else this.held=0;let s=(r?we(a/6,-.7,1):0)+.3*this.content;this.brow=Te(this.brow,s,r?.12:.45,t),this.lookUp=.32*Math.max(0,this.brow);let c=r?.92*Ce(.9,1.9,this.held)*Ce(.15,.55,this.brow):0;this.hold=Te(this.hold,c,c>this.hold?.35:.08,t),this.clock>=this.nextBlink&&this.hold<.2&&(this.blinkAt=this.clock,this.secondBlink=!this.secondBlink&&Math.random()<.18,this.nextBlink=this.clock+(this.secondBlink?.28:2+Math.random()*4.5));let l=(this.clock-this.blinkAt)/.17,u=this.blinkAt>=0&&l<1?Math.sin(Math.PI*l)**.7:0;this.lid=Math.max(u,this.hold,.95*this.content);let d=e?.beatStep??-1;if(d>=0&&this.lastStep>=0&&d!==this.lastStep){let e=d<this.lastStep;(e||Math.floor(d/4)!==Math.floor(this.lastStep/4))&&(this.nodSpring.v-=e||Math.floor(d/16)!==Math.floor(this.lastStep/16)?1.3:.8)}this.lastStep=d,this.nod=this.nodSpring.step(.13*this.brow,t);let f=Ce(.6,2,this.held)*.07*Math.sin(this.clock*1.7);this.tilt=this.tiltSpring.step(f+.05*we(o,-1.5,1.5),t)}};function ke(e,t,n){let r=e.tract,i=he(e,n),a={x:(t.upperLip[6].x+t.lowerLip[6].x)/2+.15,y:(t.upperLip[6].y+t.lowerLip[6].y)/2};return[{id:`tongue`,pos:t.tongueCenter,label:`Tongue body`},{id:`tip`,pos:t.tip,label:`Tongue tip`},{id:`jaw`,pos:i(7.5,4.9),label:`Jaw`},{id:`lips`,pos:a,label:`Lips`},{id:`velum`,pos:t.velum[Math.floor(t.velum.length/2)],label:`Soft palate`},{id:`larynx`,pos:{x:t.glottis.x+1.2*r.scale,y:t.glottis.y},label:`Larynx`}]}var Y=(e,t,n)=>{let r=Math.max(0,Math.min(1,(n-e)/(t-e)));return r*r*(3-2*r)},Ae=e=>Math.max(0,Math.min(1,e));function X(e,t){if(t<=e[0][0])return e[0][1];for(let n=1;n<e.length;n++)if(t<=e[n][0]){let[r,i]=e[n-1],[a,o]=e[n];return i+(o-i)*(t-r)/(a-r)}return e[e.length-1][1]}var je=[[-4.6,5.3],[0,5.4],[2.5,5.5],[4.5,5.25],[6.5,5.5],[8.5,6.1],[10.5,6.6],[12.5,7],[15,7.3],[17.5,7.65],[19.5,7.4],[21,6.5],[22.2,4.6],[23,1]],Me=[[3.4,5.9],[4.6,6.2],[5.7,6.15],[6.5,6.2],[8,6.35],[9.5,6.35],[10.6,6.55],[11.6,6.75],[12.6,6.9],[13.9,7.15],[15,7.45],[16.1,7.95]],Ne=[[3.4,2],[4.6,2.2],[5.7,2.4],[6.5,2.6],[10.6,1.7],[11,1.75],[11.65,1.2],[12.6,.95],[13.9,.75],[15,.9],[16.1,1.6]],Pe=[[-4.6,.5],[3,.5],[6,.42],[12,.42],[16,.45],[23,.45]],Fe=[[-3,8.5],[-1.6,8],[-.6,6.4],[1.2,4.6],[3.5,3.6],[5.3,3],[7.3,3.3],[8.6,4.4]],Ie=[[6,-.6],[7.4,-.8],[9.6,-1.9],[10.6,-2.5],[12,-2.6]],Le=[[12.3,4],[13,5.6],[14.5,6.4],[16.5,6.9],[18.5,6.6],[20,5.4],[21,3.6],[21.45,.5]],Re=[[0,1.5],[.15,1.9],[.35,2.35],[.6,2.45],[.8,2.2],[.92,1.5],[1,.55]],ze=[[0,1.3],[.35,1.1],[.7,.9],[.9,.55],[1,.25]],Be=[[.85,1.05,.7],[.68,.95,.65],[.78,1.1,.8],[.7,.85,.9],[.68,.8,.9],[1,.75,1.1],[.92,.7,1.05]],Ve=[[.54,.9,.6],[.6,.92,.62],[.7,1,.75],[.7,.85,.8],[.72,.8,.85],[1.1,.72,1.05],[1.05,.7,1]],He=3,Z=2.2,Ue=e=>Math.abs(e)<1?(1-e*e)**2:0;function We(e,t,n=!1){let r=(1-Math.min(1,Math.abs(t)/e.W)**+e.pf)**(1/e.pf);return e.xw+(e.Fs-e.xw)*r+(n?0:e.E*Ue(t/e.wf))}function Ge(e,t){let n=t>e.xw,r=n?(t-e.xw)/Math.max(1e-6,e.Fs-e.xw):(e.xw-t)/Math.max(1e-6,e.xw-e.Bk),i=n?e.pf:Z;return e.W*Math.max(0,1-Math.min(1,r)**+i)**(1/i)}function Ke(e,t,n){n.length=0;for(let t=0;t<12;t++){let r=Math.PI-t/12*(Math.PI/2);n.push(e.xw-(e.xw-e.Bk)*Math.abs(Math.cos(r))**(2/Z),e.W*Math.sin(r)**(2/Z))}let r=Math.asin(Math.min(1,(t/e.W)**(e.pf/2)));for(let t=0;t<10;t++){let i=Math.PI/2-t/10*(Math.PI/2-r),a=e.W*Math.sin(i)**(2/e.pf);n.push(e.xw+(e.Fs-e.xw)*Math.cos(i)**(2/e.pf)+e.E*Ue(a/e.wf),a)}for(let r=0;r<=16;r++){let i=t*(1-r/16);n.push(We(e,i),i)}}var qe=class{dy;rows=[];y0;y1;constructor(e,t,n){this.dy=t;let r=1/0,i=-1/0;for(let t of e)r=Math.min(r,t.y),i=Math.max(i,t.y);this.y0=r,this.y1=i;for(let a=r;a<=i;a+=t){let t=-1/0,r=1/0;for(let n=0;n<e.length-1;n++){let i=e[n],o=e[n+1];if(i.y>a==o.y>a)continue;let s=i.x+(o.x-i.x)*(a-i.y)/(o.y-i.y);t=Math.max(t,s),r=Math.min(r,s)}this.rows.push(t>r?n(a,t,r):null)}}at(e){let t=(e-this.y0)/this.dy,n=Math.floor(t);if(n<0||n>=this.rows.length-1)return null;let r=this.rows[n],i=this.rows[n+1];if(!r||!i)return r??i;let a=t-n,o=(e,t)=>e+(t-e)*a;return{F:o(r.F,i.F),Bk:o(r.Bk,i.Bk),Fs:o(r.Fs,i.Fs),W:o(r.W,i.W),xw:o(r.xw,i.xw),E:o(r.E,i.E),wf:o(r.wf,i.wf),pf:o(r.pf,i.pf)}}},Q=class{lines=[];cur=[];p(e,t,n){return this.cur.push(e,t,n),this}end(e=!1){e&&this.cur.length>=3&&this.cur.push(this.cur[0],this.cur[1],this.cur[2]),this.cur.length>=6&&this.lines.push(new Float32Array(this.cur)),this.cur=[]}ellipse(e,t,n,r=24,i=0,a=Math.PI*2){for(let o=0;o<=r;o++){let s=i+(a-i)*o/r,c=Math.cos(s),l=Math.sin(s);this.p(e[0]+t[0]*c+n[0]*l,e[1]+t[1]*c+n[1]*l,e[2]+t[2]*c+n[2]*l)}this.end()}};function Je(e,t,n,r){let i=n/e,a=r/e,o=a>=7?a:7-(7-a)/t,s=1-Y(7.6,9.1,o),c=X(Fe,i),l=Y(c-1.5,c+.15,o),u=X(Ie,o),d=Y(u-.7,u+.9,i);return s*l*d}var Ye=1.7,Xe=.55;function Ze(e,t,n,r){let i=n/e,a=r/e,o=a>=7?a:7-(7-a)/t,s=((i-5.2)/2.3)**2+((o-8.3)/2.4)**2;return s<1?(1-s)**2:0}function Qe(e,t,n,r){if(t===0||r===0)return[0,0];let i=t*r*e;return[Xe*i,Math.sign(n)*Ye*i*Y(.4*e,2.6*e,Math.abs(n))]}function $e(e,t,n){let r=t.length;if(t.every(Boolean))return[n?[...e,e[0],e[1],e[2]]:e];let i=[],a=n?t.indexOf(!1)+1:0,o=[];for(let n=0;n<r;n++){let s=(a+n)%r;t[s]?o.push(e[3*s],e[3*s+1],e[3*s+2]):(o.length>=6&&i.push(o),o=[])}return o.length>=6&&i.push(o),i}function et(e,t){let n=[0];for(let t=1;t<e.length;t++)n.push(n[t-1]+Math.hypot(e[t].x-e[t-1].x,e[t].y-e[t-1].y));let r=n[n.length-1],i=[],a=0;for(let o=0;o<t;o++){let s=r*o/(t-1);for(;a<e.length-2&&n[a+1]<s;)a++;let c=(s-n[a])/Math.max(1e-9,n[a+1]-n[a]);i.push({x:e[a].x+(e[a+1].x-e[a].x)*c,y:e[a].y+(e[a+1].y-e[a].y)*c})}return i}function tt(e,t,n){let r=n*t[t.length-1],i=0;for(;i<e.length-2&&t[i+1]<r;)i++;let a=(r-t[i])/Math.max(1e-9,t[i+1]-t[i]);return{x:e[i].x+(e[i+1].x-e[i].x)*a,y:e[i].y+(e[i+1].y-e[i].y)*a}}var nt=e=>{let t=[0];for(let n=1;n<e.length;n++)t.push(t[n-1]+Math.hypot(e[n].x-e[n-1].x,e[n].y-e[n-1].y));return t};function rt(t){let n=t.tract,i=n.scale,a=t.bodyParams.pharynx,o=ye(t),s=e=>o(0,e).y,c=e=>e/i>=7?e/i:7-(7-e/i)/a,l=(e,t)=>n.P(e,t),u={...e,jaw:0,lipAp:0,labiodental:0},d=t.frame(u),f=be(t,d,u),m=new qe([...f.skinLower,...f.skinUpper],.08*i,(e,t,n)=>{let r=c(e),a=r>=3.4&&r<=16.1?X(Me,r)*i:1/0,o=Math.min(t,a),s=2.2+.4*Y(2.5,3.5,r)*(1-Y(17,18.5,r));return{F:t,Bk:n,Fs:o,W:X(je,r)*i,xw:n+(o-n)*X(Pe,r),E:t-o,wf:X(Ne,r)*i,pf:s}}),h=l(-2.5,10.5),g=d.upperLip[d.upperLip.length-1].y,_=d.lowerLip[d.lowerLip.length-1].y,v=He*i,y=(e,t,n,r)=>t>_&&t<g&&Math.abs(n)<v&&e>r.xw,b=[],x=(e,t,n)=>{for(let r of $e(e,t,n)){let e=r.length/3,t=new Float32Array(e),n=new Float32Array(e);for(let o=0;o<e;o++)t[o]=Je(i,a,r[3*o],r[3*o+1]),n[o]=Ze(i,a,r[3*o],r[3*o+1]);b.push({a:new Float32Array(r),w:t,c:n})}},S=[],C=1.4*i;for(let e=m.y0+.25*i;e<m.y1-.2*i;e+=C){let t=m.at(e);if(!t||t.W<.2*i)continue;Ke(t,Math.min(.6*t.W,3.6*i),S);let n=[],r=[],a=S.length/2;for(let t=0;t<a;t++)n.push(S[2*t],e,S[2*t+1]);for(let t=a-2;t>0;t--)n.push(S[2*t],e,-S[2*t+1]);for(let i=0;i<n.length/3;i++)r.push(!y(n[3*i],e,n[3*i+2],t));x(n,r,!0)}let w=.3*i;for(let e of[-3.6,-2.4,-1.2,1.2,2.4,3.6].map(e=>e*i)){let t=[],n=[];for(let r=m.y0+.1*i;r<=m.y1;r+=w){let i=m.at(r);if(!i||Math.abs(e)>.97*i.W){x(t,n,!1),t=[],n=[];continue}let a=We(i,e);t.push(a,r,e),n.push(!y(a,r,e,i))}x(t,n,!1)}for(let e of[.5,.8].map(e=>e*Math.PI))for(let t of[1,-1]){let n=[],r=[];for(let a=m.y0+.1*i;a<=m.y1;a+=w){let o=m.at(a);!o||o.W<.2*i||(n.push(o.xw-(o.xw-o.Bk)*Math.abs(Math.cos(e))**(2/Z),a,t*o.W*Math.sin(e)**(2/Z)),r.push(!0))}x(n,r,!1)}let T=[],E=[],D=(e,t,n,r,i,a=!1)=>{let o=new Q;i(o),e.push({lines:o.lines,color:t,width:n,alpha:r,hot:a})},O=(e,t,n,r)=>{let i=N(t.map(([e,t])=>o(e,t)),4);i.forEach((t,a)=>{let o=m.at(t.y);e.p(t.x,t.y,r*((o?Ge(o,t.x):0)+n(a,i.length)))}),e.end()};D(T,r.blueDim,1.05,.9,e=>{for(let t of[1,-1]){O(e,[[-2.55,13.4],[-2.85,14.75],[-3.65,15.45],[-4.6,15.25],[-5.2,14.25],[-5.4,12.8],[-5.05,11.3],[-4.55,10.2],[-3.95,9.55],[-3.35,9.65],[-3,10.35]],(e,t)=>(.25+1.2*Math.sin(Math.PI*e/(t-1))**1.5)*i,t),O(e,[[-3.15,14.3],[-3.95,14.45],[-4.55,13.5],[-4.6,12.1],[-4.15,11.05]],()=>.55*i,t),O(e,[[-2.7,11.2],[-2.55,11.85],[-2.75,12.35]],()=>.35*i,t);let n=[];for(let e=0;e<=16;e++)n.push([-3.5+.6*Math.cos(e/16*Math.PI*2),12+.85*Math.sin(e/16*Math.PI*2)]);O(e,n,()=>.12*i,t)}}),D(T,r.blueMid,1,.8,e=>{for(let t of[1,-1]){for(let n=14.6;n>=11.3;n-=.15){let r=s(n),a=m.at(r);if(!a)continue;let o=t*(.3+1.05*(14.6-n)/3.3)*i;e.p(We(a,o),r,o)}e.end();for(let[n,r,a]of[[7.95,11.05,.95],[7.4,11.15,1.45],[7.25,11.6,1.55],[7.55,12.1,1.35],[8.2,12.15,1]])e.p(n*i,s(r),t*a*i);e.end()}}),D(T,r.blueMid,1,.9,e=>{for(let t of[1,-1])e.ellipse([8.05*i,s(10.98),t*.62*i],[.42*i,.04*i,0],[0,0,.26*i],16)});let k=new qe(f.brain,.08*i,(e,t,n)=>({F:t,Bk:n,Fs:t,W:X(Le,c(e))*i,xw:n+(t-n)*.48,E:0,wf:1,pf:2.3}));D(T,r.blueMid,.85,.32,e=>{for(let t=k.y0+.6*i;t<k.y1-.15*i;t+=1.5*i){let n=k.at(t);if(n){for(let r=0;r<=48;r++){let i=r/48*Math.PI*2,a=Math.cos(i),o=Math.sin(i),s=a>=0?n.pf:Z,c=a>=0?n.xw+(n.Fs-n.xw)*a**(2/s):n.xw-(n.xw-n.Bk)*(-a)**(2/s);e.p(c,t,Math.sign(o)*n.W*Math.abs(o)**(2/s))}e.end()}}for(let t of[.3,.7].map(e=>e*Math.PI))for(let n of[1,-1]){for(let r=k.y0;r<=k.y1;r+=.3*i){let i=k.at(r);if(!i)continue;let a=Math.cos(t),o=Math.sin(t),s=a>=0?i.pf:Z,c=a>=0?i.xw+(i.Fs-i.xw)*a**(2/s):i.xw-(i.xw-i.Bk)*(-a)**(2/s);e.p(c,r,n*i.W*o**(2/s))}e.end()}}),D(T,r.blueDim,.9,.6,e=>{for(let t=0;t<9;t++){let n=-4.4+t*1.75;if(n>10.5)break;let r=ve(n)-2.25,a=l(r,n+.08),o=l(r,n+1.32),s=l(r+.8,0).x,c=.8*i,u=1.05*i;for(let t of[a.y,o.y])e.ellipse([s,t,0],[c,0,0],[0,0,u],24);for(let t of[.25,.75,1.25,1.75].map(e=>e*Math.PI))e.p(s+c*Math.cos(t),a.y,u*Math.sin(t)).p(s+c*Math.cos(t),o.y,u*Math.sin(t)).end();let d=(a.y+o.y)/2,f=s-2.15*i;e.ellipse([f,d,0],[.72*i,0,0],[0,0,.88*i],20);for(let t of[1,-1])e.p(s-.7*i,d,t*.55*i).p(f+.45*i,d,t*.72*i).end(),e.p(s-.5*i,d,t*.95*i).p(s-.9*i,d-.1*i,t*2.3*i).end();e.p(f-.72*i,d,0).p(f-1.8*i,d-.55*i,0).end()}}),D(T,r.blueDim,.85,.5,e=>{let t=l(-4.9,0).x;for(let n=-4.4;n<=11;n+=1.75)e.ellipse([t,l(0,n).y,0],[.42*i,0,0],[0,0,.6*i],16);for(let n of[1,-1])e.p(t,l(0,-4.6).y,n*.6*i).p(t,l(0,11.4).y,n*.6*i).end()}),D(T,r.blueDim,.9,.7,e=>{for(let t of[1,-1]){for(let n of f.nasal)e.p(n.x,n.y,t*1.2*i);e.end(!0);for(let n of f.turbinates){for(let r of n)e.p(r.x,r.y,t*.95*i);e.end()}}});let A=(e,t,n)=>{let r=[];for(let i=0;i<=60;i++){let a=n*i/60;r.push({x:e-t*(a/n)**1.85,y:a})}return{pts:r,cum:nt(r)}},j=(e,t,n,r,a,o,s)=>{let c=A(t,n,r),l=c.cum[c.cum.length-1],u=a.reduce((e,t)=>e+t[0],0),d=.97*l/(u*i);for(let t of[1,-1]){let n=0;for(let[u,f,p]of a){let a=u*i*d,m=f*i,h=p*i,g=(n+a/2)/l;n+=a;let _=tt(c.pts,c.cum,g),v=tt(c.pts,c.cum,Math.min(1,g+.01)),y=tt(c.pts,c.cum,Math.max(0,g-.01)),b=v.x-y.x,x=v.y-y.y,S=Math.hypot(b,x)||1;b/=S,x/=S;let C=x,w=-b,T=o(_.y/r),E=(e,n,r=0)=>[_.x+b*e-C*r,T+s*n,t*(_.y+x*e-w*r)];for(let[t,n]of[[-.5,0],[-.5,.55],[-.38,1],[0,1.08],[.38,1],[.5,.55],[.5,0]])e.p(...E(t*a,n*m));e.end(!0);for(let[t,n]of[[-.45,.1],[.45,.1],[.45,.9],[-.45,.9]])e.p(...E(t*a,0,n*h));e.end(!0)}}},M=l(7.3,0).x,P=4.2*i,F=2.65*i;D(T,r.blue,1,.8,e=>j(e,M,P,F,Be,e=>(7.95+.3*e*e)*i,1)),D(T,r.blueMid,1,.6,e=>{for(let t of[0,2,4,5,6,7]){let n=f.palOral[t],r=Math.max(0,(M-n.x)/P),a=(r>=1?F:F*r**(1/1.85))-.45*i,o=(8.95+.3*Math.min(1,a/F)**2)*i;if(!(a<.6*i||n.y<o+.15*i)){for(let t=0;t<=20;t++){let r=a*(t/10-1);e.p(n.x,o+(n.y-o)*(1-(Math.abs(r)/a)**2.4)**.7,r)}e.end()}}});let I=(e,t,n)=>{let r=l(e,t);return[r.x,r.y,n*i]},L=(e,t,n)=>{let r=t.map(([e,t,r])=>I(e,t,n*r));for(let t=0;t<r.length-1;t++){let n=r[Math.max(0,t-1)],i=r[t],a=r[t+1],o=r[Math.min(r.length-1,t+2)];for(let t=0;t<4;t++){let r=t/4,s=r*r,c=s*r,l=(e,t,n,i)=>.5*(2*t+(-e+n)*r+(2*e-5*t+4*n-i)*s+(-e+3*t-3*n+i)*c);e.p(l(n[0],i[0],a[0],o[0]),l(n[1],i[1],a[1],o[1]),l(n[2],i[2],a[2],o[2]))}}e.p(...r[r.length-1]),e.end()};D(E,r.red,1.25,.9,e=>{for(let t of[1,-1]){L(e,[[6.4,4.6,0],[5.6,4.45,1.5],[4.5,4.4,2.6],[3.2,4.5,3.5],[1.8,4.85,4.15],[.4,5.6,4.6],[-.55,6.6,4.85],[-.9,7.6,4.9],[-1.45,8.9,4.95],[-1.9,9.7,5],[-2.15,10.2,5]],t),L(e,[[-1.8,10.25,4.95],[-.9,9.4,4.85],[.15,10.1,4.6],[.6,8.9,4.35],[1.1,7.7,4],[1.9,7.2,3.55]],t);let n=I(-2.5,10.5,t*4.95);e.ellipse(n,[.45*i,0,0],[0,.12*i,.85*i],16)}}),D(E,r.red,1,.55,e=>{for(let t of[1,-1]){L(e,[[1.9,7.2,3.55],[3,7.15,3.15],[4.3,7.1,2.6],[5.4,7.05,1.85],[6.2,7.05,1.05],[6.72,7.15,0]],t);for(let[n,r,i,a,o]of[[3,3.15,3.2,4.5,3.5],[5.4,1.85,5.6,4.45,1.5],[1.9,3.55,1.8,4.85,4.15]])L(e,[[n,7.15,r],[(n+i)/2,5.9,(r+o)/2+.15],[i,a,o]],t)}});let R=new Q;L(R,[[7.25,6.75,0],[7.4,5.4,0],[6.4,4.6,0],[5.6,5,0],[5.9,6.2,0],[6.45,6.55,0]],1);let ee=R.lines[0],te=l(6.98,0).x,z=4*i,B=2.5*i;D(E,r.blue,1,.8,e=>j(e,te,z,B,Ve,e=>(7.75+.45*e**1.5)*i,-1));let V=o(6.15,15.35);return{model:t,head:m,condyle:h,lipHalf:v,center:new p(.3*i,(m.y0+m.y1)/2,0),shell:b,fixed:T,jaw:E,chin:ee,eyes:[[V.x,V.y,3.15*i],[V.x,V.y,-3.15*i]],eyeR:1.05*i}}var it=[.09,.06,.03],at=class{scene=new T;camera=new O(24,1,5,2e3);beams=new pe;rest=null;w=1;h=1;compact=!1;centred=!1;facing=1;clock=0;gaze=new xe;face=new Oe;eye=new p;turn=new A;euler=new E;strobe=0;tmp=new le;particles=[];echoes=[];lastEcho=-1;sparkSeed=7;k=1;ring={n:0,s:new Float64Array(80),cx:new Float64Array(80),cy:new Float64Array(80),ux:new Float64Array(80),uy:new Float64Array(80),a:new Float64Array(80),b:new Float64Array(80)};v3=new p;caliper=null;constructor(){this.scene.add(this.beams.group),this.scene.fog=new d(0,50,100);for(let e=0;e<200;e++)this.particles.push({s:Math.random()*17,u:Math.random()*2-1,v:Math.random()*2-1,life:Math.random(),px:NaN,py:NaN,pz:NaN})}dispose(){this.beams.dispose()}resetMotion(){this.face=new Oe,this.echoes=[],this.lastEcho=-1,this.strobe=0;for(let e of this.particles)e.px=NaN}resize(e,t){this.w=e,this.h=t,this.compact=e<560,this.camera.aspect=e/t,this.compact||this.centred?this.camera.clearViewOffset():this.camera.setViewOffset(e,t,.1*e,0,e,t),this.camera.updateProjectionMatrix(),this.beams.setResolution(e,t);for(let e of this.particles)e.px=NaN}poses(e){let t=this.restFor(e),n=Math.tan(this.camera.fov*Math.PI/360),r=1.1*Math.max(15.2/n,11/(n*Math.max(.3,this.camera.aspect))),i=t.center.clone(),a=this.facing>0?.62:Math.PI-.62,o=.2;return{target:i,home:i.clone().add(new p(Math.sin(a)*Math.cos(o),Math.sin(o),Math.cos(a)*Math.cos(o)).multiplyScalar(r)),side:i.clone().add(new p(0,0,this.facing*r))}}restFor(e){return this.rest&&this.rest.model===e||(this.rest=rt(e)),this.rest}project(e,t,n){let r=this.v3.set(e,t,n).applyMatrix4(this.beams.group.matrixWorld).project(this.camera);return[(r.x+1)/2*this.w,(1-r.y)/2*this.h]}pxPerCmAt(e,t,n){let r=this.camera.matrixWorld.elements,[i,a]=this.project(e,t,n),[o,s]=this.project(e+r[0],t+r[1],n+r[2]);return Math.hypot(o-i,s-a)}crown(e){let t=this.restFor(e),n=e.tract.scale,r=t.head.at(t.head.y1-1.2*n),i=r?(r.F+r.Bk)/2:t.center.x,[a,o]=this.project(i,t.head.y1,0);return{x:a,y:o,cmPx:this.pxPerCmAt(i,t.head.y1,0)}}faceView(e,t,n){let r=ke(e,t,n).find(e=>e.id===`lips`).pos;return{handles:ke,X:e=>this.project(e.x,e.y,0)[0],Y:e=>this.project(e.x,e.y,0)[1],pxPerCm:this.pxPerCmAt(r.x,r.y,0)}}update(e,t,i,a,o,s){this.clock+=s;let c=this.restFor(e),l=e.tract.scale,u=this.face;this.headPose(c,l);let d=me(e,i.jaw),f=c.condyle,p=this.beams,m=this.camera.position.distanceTo(c.center),h=this.scene.fog;h.near=m-3*l,h.far=m+30*l,p.begin();let g=(e,t=0)=>{let n=new Float32Array(e.length*3);return e.forEach((e,r)=>{n[3*r]=e.x,n[3*r+1]=e.y,n[3*r+2]=t}),n},_=this.v3.copy(this.eye).sub(c.center).normalize(),v=Y(.25,.8,Math.abs(_.z)),y=.22+.78*v,b=.45+.55*v,x=(e,t,n,r={},i=y)=>p.line(g(e),e.length,t,n,{...r,alpha:(r.alpha??1)*i}),S=(e,t,n)=>n===0?[e,t]:ot(e,t,f,n);this.k=l;for(let e of c.fixed)for(let t of e.lines)p.line(t,t.length/3,e.color,e.width,{alpha:e.alpha,hot:e.hot});for(let e of c.jaw)for(let t of e.lines){let n=this.tmp.reset();for(let e=0;e<t.length;e+=3){let[r,i]=S(t[e],t[e+1],d);n.p(r,i,t[e+2])}p.poly(n,e.color,e.width,{alpha:e.alpha,hot:e.hot})}for(let e of c.shell){let t=this.tmp.reset();for(let n=0;n<e.w.length;n++){let r=e.a[3*n+2],[i,a]=Qe(l,e.c[n],r,u.puff),[o,s]=S(e.a[3*n]+i,e.a[3*n+1],d*e.w[n]);t.p(o,s,r+a)}p.poly(t,r.blueDim,.85,{alpha:.42})}let C=be(e,t,i);x(C.inset,r.blueDim,.9,{alpha:.5}),x(C.skull,r.blueDim,.9,{close:!0,alpha:.6}),x(C.brain,r.blueMid,1,{close:!0,alpha:.75}),x(C.sulcus,r.blueDim,.9),x(C.nasal,r.blueMid,1,{close:!0}),x(C.palOral,r.blueMid,1.1),x(C.palNasal,r.blueMid,1.1),x(C.skinLower,r.blue,1.5),x(C.skinUpper,r.blue,1.5),x(C.outerWall,r.blue,1.4,{hot:!0}),x(t.inner,r.blue,1.3,{alpha:.9}),x(C.glottisWall,r.blue,1.2,{alpha:.8}),this.eyes(c,s),this.airway(e,t,a,o,l),this.velum(t,l),this.epiglottis(t,l,b),this.larynx(e,t,i,a,l,s,c.head.y0,y);let w=g(t.tongue),T=(e,t)=>g(n(e.map(e=>[e.x,e.y]),t).map(([e,t])=>({x:e,y:t}))),E=T(t.upperLip,2),D=T(t.lowerLip,2),O=this.lips(c,e,t,i,d),k=c.chin,A=new Float32Array(k.length);for(let e=0;e<k.length;e+=3){let[t,n]=S(k[e],k[e+1],d);A[e]=t,A[e+1]=n}if(a&&this.clock-this.lastEcho>=.028){this.lastEcho=this.clock;let e=[{a:w,color:r.green},{a:A,color:r.red},{a:E,color:r.pink},{a:D,color:r.pink}];for(O&&e.push({a:O,color:r.pink}),this.echoes.push({t:this.clock,lines:e});this.echoes.length&&this.clock-this.echoes[0].t>.12;)this.echoes.shift()}a&&it.forEach((e,t)=>{let n=this.nearestEcho(this.clock-e);if(n)for(let e of n.lines)p.line(e.a,e.a.length/3,e.color,1,{alpha:(.1+.07*t)*b})}),this.tongue(t,i,l),p.line(A,A.length/3,r.red,1.5,{hot:!0,alpha:b}),p.line(w,t.tongue.length,r.green,1.6,{hot:!0,alpha:b}),p.line(E,E.length/3,r.pink,1.5,{hot:!0,alpha:b}),p.line(D,D.length/3,r.pink,1.5,{hot:!0,alpha:b}),x(n(t.velum.map(e=>[e.x,e.y]),3).map(([e,t])=>({x:e,y:t})),r.white,1.25,{alpha:.92},b),o.particles&&a&&this.drawParticles(e,t,a,s),a&&this.drawTurbulence(e,t,a),this.caliper=null,o.calipers&&this.drawCaliper(t),p.end()}nearestEcho(e){let t=null,n=.016;for(let r of this.echoes){let i=Math.abs(r.t-e);i<n&&(n=i,t=r)}return t}headPose(e,t){let n=this.beams.group,r=this.v3.set(-2.4*t,e.head.y0+.42*(e.condyle.y-e.head.y0),0);this.turn.setFromEuler(this.euler.set(this.face.tilt,0,this.face.nod)),n.quaternion.copy(this.turn),n.position.copy(r).sub(r.applyQuaternion(this.turn)),n.updateMatrixWorld(!0),this.eye.copy(this.camera.position),n.worldToLocal(this.eye)}eyes(e,t){let n=this.gaze,i=this.face;n.update(this.clock,t);let a=e.eyeR,o=n.pitch+1.3*i.lookUp,s=[Math.cos(o)*Math.cos(n.yaw),Math.sin(o),Math.cos(o)*Math.sin(n.yaw)],c=e=>{let t=ct(st(Math.abs(e[1])>.9?[1,0,0]:[0,1,0],e));return[t,st(e,t)]},l=this.eye,u=1-Y(.4,.9,i.lid),d=Math.max(0,i.brow);for(let t of e.eyes){let[e,n]=c(ct([l.x-t[0],l.y-t[1],l.z-t[2]])),o=new Q;o.ellipse(t,$(e,a),$(n,a),36);let[f,p]=c(s),m=[t[0]+s[0]*a*.86,t[1]+s[1]*a*.86,t[2]+s[2]*a*.86];o.ellipse(m,$(f,a*.5),$(p,a*.5),24);let h=[t[0]+s[0]*a*.97,t[1]+s[1]*a*.97,t[2]+s[2]*a*.97];o.ellipse(h,$(f,a*.2),$(p,a*.2),14);let g=Math.sign(t[2]),_=(e,t,n)=>e*(1-t*t)+.06*t*g*n,v=e=>{for(let n=0;n<=16;n++){let r=-1+n/8,s=g*r*.95,c=_(-.36,r,-1),l=e?_(.5+.2*d,r,1)*(1-i.lid)+(c+.03)*i.lid:c;o.p(t[0]+1.04*a*Math.cos(l)*Math.cos(s),t[1]+1.04*a*Math.sin(l),t[2]+1.04*a*Math.cos(l)*Math.sin(s))}o.end()};v(!0),v(!1);let y=.3*i.brow,b=.28*Math.max(0,-i.brow),x=.22*i.lid*d;for(let e=0;e<=12;e++){let n=-1+e/6,r=g*(.15+n*.62),i=(1-n)/2,s=.82+.12*(1-n*n)-.06*n+y+(x-b)*i;o.p(t[0]+1.32*a*Math.cos(s)*Math.cos(r),t[1]+1.32*a*Math.sin(s),t[2]+1.32*a*Math.cos(s)*Math.sin(r))}o.end();let S=[[r.blueMid,1,.35],[r.blue,1,.9*u],[r.blue,1,.7*u],[r.blue,1.25,.95],[r.blue,1.05,.75],[r.blueMid,1.3,.8]];o.lines.forEach((e,t)=>this.beams.line(e,e.length/3,S[t][0],S[t][1],{alpha:S[t][2]}))}}lips(e,t,n,i,a){let o=t.tract.scale,s=e.condyle,c=e.head,l=this.beams,u=t.bodyParams.pharynx,d=e.lipHalf,f=Math.max(.3*o,(1.1+(t.bodyParams.lipWidth-1.1)*Ae(i.lipWidth))*o/2),p=n.upperLip.slice(6),m=n.lowerLip.slice(6).map(e=>M(e,s,-a)),h=nt(p),g=nt(m),_=p[0],v=m[0],y=(_.y+v.y)/2,b=(e,t)=>{let n=c.at(e);return n?We(n,t,!0):0},x=_.x-b(_.y,0),S=v.x-b(v.y,0),C=(x+S)/2,w=p[p.length-1].y,T=m[m.length-1].y,E=this.tmp,D=(e,t,n)=>{let r=Math.sqrt(Math.max(0,1-(n/f)**2)),i=tt(e?p:m,e?h:g,t),c=e?_:v,l=e?w:T,E=y+(c.y-y)*r,D=l-c.y,O=E+(i.y-c.y)*(l-E)/(Math.abs(D)<1e-4?1e-4:D),k=Math.max(0,1-(n/d)**2)**1.5,A=i.x-b(i.y,0)+(C-(e?x:S))*(1-r)*(1-t),j=b(O,n)+A*k,M=e?.5*(1-r)*(1-t):.5*(1+r)+.5*(1-r)*t,N=M+(Je(o,u,j,O)-M)*Y(f,d,Math.abs(n)),[P,F]=Qe(o,Ze(o,u,j,O),n,this.face.puff),[I,L]=N?ot(j+P,O,s,a*N):[j+P,O];return[I,L,n+F]},O=(e,t,n,r,i)=>{E.reset();for(let a=0;a<=i;a++){let o=n+(r-n)*a/i;E.p(...D(e,t(o),o))}return E},k=[.66,.88];for(let e of[!0,!1]){for(let t of k)l.poly(O(e,()=>t,-d,d,24),r.blueDim,.85,{alpha:.42});for(let t of[-.8,-.5,.5,.8].map(e=>e*d)){E.reset();for(let n=0;n<=8;n++)E.p(...D(e,.45+.55*n/8,t));l.poly(E,r.blueDim,.85,{alpha:.42})}let t=Math.min(d,f+.3*o),n=n=>{let r=Math.sqrt(Math.max(0,1-(n/t)**2)),i=e?-.07*Math.exp(-((n/(.32*o))**2))+.05*Math.exp(-(((Math.abs(n)-.55*o)/(.3*o))**2)):0;return Math.max(0,(e?.42:.45)*r+i*r)};l.poly(O(e,n,-t,t,28),r.pink,1.3,{alpha:.95}),l.poly(O(e,e=>.45*n(e),-t,t,28),r.pink,1,{alpha:.45})}for(let e of[1,-1])l.poly(O(!0,()=>0,e*f,e*d,6),r.pink,1,{alpha:.6});let A=n.upperLip[6].y-n.lowerLip[6].y>.02*o;E.reset();for(let e=0;e<=24;e++)E.p(...D(!0,0,-f+2*f*e/24));if(A)for(let e=23;e>0;e--)E.p(...D(!1,0,-f+2*f*e/24));return l.poly(E,r.pink,2.1,{hot:!0,close:A}),A?E.a.slice(0,E.n*3):null}tongue(e,t,n){let i=e.tongue,a=0,o=1/0;i.forEach((t,n)=>{let r=(t.x-e.tip.x)**2+(t.y-e.tip.y)**2;r<o&&(o=r,a=n)});let s=et(i.slice(0,a+1),22),c=Ae(t.lateral),l=s.map((e,t)=>{let r=s[Math.max(0,t-1)],i=s[Math.min(21,t+1)],a=i.x-r.x,o=i.y-r.y,l=Math.hypot(a,o)||1;a/=l,o/=l;let u=t/21;return{p:e,nx:-o,ny:a,W:X(Re,u)*n,h:(X(ze,u)+.8*c*Y(.45,.8,u))*n}}),u=(e,t)=>{let n=e.h*(1-Math.cos(t));return[e.p.x-e.nx*n,e.p.y-e.ny*n,e.W*Math.sin(t)]},d=this.tmp;for(let e=1;e<21;e+=2){d.reset();for(let t=0;t<=12;t++)d.p(...u(l[e],-Math.PI/2+Math.PI*t/12));this.beams.poly(d,r.green,1,{alpha:.5})}for(let e of[-Math.PI/2,-Math.PI/4,Math.PI/4,Math.PI/2]){d.reset();for(let t of l)d.p(...u(t,e));this.beams.poly(d,r.green,Math.abs(e)>1?1.25:1,{alpha:Math.abs(e)>1?.8:.45})}}airway(e,n,a,o,s){let c=n.grid,l=this.ring;if(l.n=0,c.length<2)return;let u=a?e.nodeS(a.t.phLen,a.t.orLen):null,d=o.pressure&&a&&u&&u.length===a.t.pressureRms.length,f=-1,p=0;for(let e=0;e<c.length&&l.n<l.s.length;e++){let t=c[e],n=t.outer.x-t.inner.x,r=t.outer.y-t.inner.y,i=Math.hypot(n,r);i>1e-4&&(f=n/i,p=r/i);let a=t.d/2,o=l.n++;l.s[o]=t.s,l.cx[o]=t.outer.x-f*a,l.cy[o]=t.outer.y-p*a,l.ux[o]=f,l.uy[o]=p,l.a[o]=a,l.b[o]=t.d>.01?Math.min(3.5*s,2*t.area/(Math.PI*t.d)):0}let m=this.tmp,h=this.eye;for(let e=0;e<l.n;e+=2){m.reset();for(let t=0;t<=24;t++){let n=t/24*Math.PI*2,r=Math.cos(n)*l.a[e],i=Math.sin(n)*l.b[e];m.p(l.cx[e]+l.ux[e]*r,l.cy[e]+l.uy[e]*r,i)}let n=h.x-l.cx[e],s=h.y-l.cy[e],c=h.z,f=Math.abs(l.uy[e]*n-l.ux[e]*s)/(Math.hypot(n,s,c)||1),p=1-.65*f*f;if(d){let n=i(lt(a.t.pressureRms,u,l.s[e]))**.85;this.beams.poly(m,t(n),.85,{alpha:(.25+.65*n)*p})}else this.beams.poly(m,r.blueDim,.85,{alpha:(o.grid?.8:.45)*p})}for(let e of[1,-1]){m.reset();for(let t=0;t<l.n;t++)m.p(l.cx[t],l.cy[t],e*l.b[t]);this.beams.poly(m,r.blue,1,{alpha:.55})}let g=n.glottis;for(let e of[.3,.65]){let t=g.x+(l.cx[0]-g.x)*e,n=g.y+(l.cy[0]-g.y)*e,i=(.55+.25*e)*s;m.reset();for(let e=0;e<=20;e++)m.p(t+i*Math.cos(e/20*Math.PI*2),n,i*Math.sin(e/20*Math.PI*2));this.beams.poly(m,r.blueDim,.9,{alpha:.6})}}airPoint(e,t,n,r){let i=this.ring;if(i.n<2)return null;if(t<=i.s[0]){let a=Math.max(0,t/Math.max(.01,i.s[0])),o=e.glottis;return[o.x+(i.cx[0]-o.x)*a+n*.3*this.k,o.y+(i.cy[0]-o.y)*a,r*.45*this.k]}let a=0,o=i.n-1;if(t>=i.s[o])return null;for(;o-a>1;){let e=a+o>>1;i.s[e]<=t?a=e:o=e}let s=(t-i.s[a])/Math.max(1e-6,i.s[o]-i.s[a]),c=e=>e[a]+(e[o]-e[a])*s,l=c(i.a)*n*.82,u=c(i.b)*r*.82;return[c(i.cx)+c(i.ux)*l,c(i.cy)+c(i.uy)*l,u]}drawParticles(e,t,n,r){let i=n.t,a=e.nodeS(i.phLen,i.orLen),o=new Float32Array(i.phAreas.length+i.orAreas.length);o.set(i.phAreas,0),o.set(i.orAreas,i.phAreas.length);let s=t.lipS;for(let e of this.particles){let n=lt(i.flow,a,e.s)/Math.max(.05,lt(o,a,e.s)),c=Math.sign(n)*2.2*Math.log1p(Math.abs(n)/30);if(e.s+=c*r,e.life-=r*.25,(e.s>s||e.s<0||e.life<=0||Math.abs(n)<3)&&!(Math.abs(n)<3&&e.life>0)){e.s=Math.random()*.8,e.u=Math.random()*2-1,e.v=Math.random()*2-1,e.life=.6+Math.random()*.8,e.px=NaN;continue}let l=this.airPoint(t,e.s,e.u,e.v);if(l){if(Number.isFinite(e.px)){let t=Math.min(2,Math.floor(Math.min(1,Math.abs(c)/6)*Math.min(1,e.life)*3));this.beams.seg(e.px,e.py,e.pz,l[0],l[1],l[2],`#ffe2a8`,1.05,.16+.2*t)}[e.px,e.py,e.pz]=l}}}drawTurbulence(e,t,n){let r=n.t;if(!(r.noiseLevel>1)||r.noiseNode<0)return;let i=e.branchS(r.noiseNode,r.phLen,r.orLen);if(i<0)return;let a=Math.min(1,Math.log10(r.noiseLevel)/3.2);if(a<=.05)return;let o=this.sparkSeed=this.sparkSeed*16807%2147483647,s=()=>(o=o*16807%2147483647)/2147483647;for(let e=0;e<40;e++){let e=this.airPoint(t,i+.2+s()*1.2,s()*2-1,s()*2-1);if(!e)continue;let n=.02+s()*.05;this.beams.seg(e[0]-n,e[1],e[2],e[0]+n,e[1],e[2],`#f4fbff`,1.6,.15+.7*a*s())}}drawCaliper(e){let t=this.ring,n=-1,i=1/0;for(let t=2;t<e.grid.length-1;t++)e.grid[t].area<i&&(i=e.grid[t].area,n=t);if(n<0||i>=1.2||n>=t.n)return;let a=this.tmp.reset();for(let e=0;e<=24;e++){let r=e/24*Math.PI*2,i=Math.cos(r)*t.a[n],o=Math.sin(r)*t.b[n];a.p(t.cx[n]+t.ux[n]*i,t.cy[n]+t.uy[n]*i,o)}this.beams.poly(a,r.white,1.3,{hot:!0});let o=e.grid[n];this.caliper={x:o.outer.x,y:o.outer.y,z:0,area:i}}velum(e,t){let n=e.velum,i=Math.floor(n.length/2)-1,a=[];for(let e=0;e<=i;e++){let r=n[e],o=n[n.length-1-e],s=r.x-o.x,c=r.y-o.y,l=Math.hypot(s,c)||1;s/=l,c/=l;let u=e/i;a.push({x:(r.x+o.x)/2,y:(r.y+o.y)/2,nx:s,ny:c,W:(1.95-1.5*u**1.5)*t,droop:.45*t*u})}let o=(e,n)=>{let r=.12*t*(1-n*n)-e.droop*n*n;return[e.x+e.nx*r,e.y+e.ny*r,e.W*n]},s=this.tmp;for(let e of[1,3,5,7,9].filter(e=>e<=i)){s.reset();for(let t=0;t<=12;t++)s.p(...o(a[e],-1+t/6));this.beams.poly(s,r.white,1,{alpha:.5})}for(let e of[-1,1]){s.reset();for(let t of a)s.p(...o(t,e));this.beams.poly(s,r.white,1,{alpha:.65})}}epiglottis(e,t,n){let[i,a]=e.epiglottis,o=a.x-i.x,s=a.y-i.y,c=Math.hypot(o,s)||1;o/=c,s/=c;let l={x:-s,y:o},u=e=>(.22+.9*Math.sin(e*Math.PI/2)**1.3)*t,d=this.tmp.reset();for(let e=0;e<=10;e++){let n=e/10,r=u(n),a=.28*t*(r/(1.12*t));d.p(i.x+o*c*n+l.x*a,i.y+s*c*n+l.y*a,r)}for(let e=1;e<12;e++){let n=u(1)*(1-2*e/12),r=.28*t*(Math.abs(n)/(1.12*t))**2;d.p(a.x+l.x*r+o*.08*t*(1-(n/u(1))**2),a.y+l.y*r+s*.08*t*(1-(n/u(1))**2),n)}for(let e=10;e>=0;e--){let n=e/10,r=u(n),a=.28*t*(r/(1.12*t));d.p(i.x+o*c*n+l.x*a,i.y+s*c*n+l.y*a,-r)}this.beams.poly(d,r.blue,1.1,{alpha:.75}),this.beams.line(new Float32Array([i.x,i.y,0,a.x,a.y,0]),2,r.blue,2.1,{alpha:.85*n})}larynx(e,t,n,i,a,o,s,c){let l=t.glottis,u=this.beams,d=new Q,f=(e,t,n)=>[l.x+e*a,l.y+t*a,n*a],p=(e,t=!1)=>{for(let[t,n,r]of e)d.p(...f(t,n,r));d.end(t)};for(let e of[1,-1])p([[1.45,1.75,0],[.75,2,e*1.2],[-.5,1.95,e*1.9],[-.6,-.6,e*1.85],[.25,-.85,e*1.5],[1.05,-.8,e*.55],[1.2,-.75,0],[1.6,.05,0],[1.9,1.15,0],[1.45,1.75,0]]),p([[-.5,1.95,e*1.9],[-.7,2.85,e*1.85]]),p([[-.6,-.6,e*1.85],[-.45,-1.25,e*1.7]]);for(let[e,t]of[[-1.75,.15],[-1.4,1.1]]){for(let n=0;n<=28;n++){let r=n/28*Math.PI*2;d.p(...f(.1+1*Math.cos(r),e+t*(1-Math.cos(r))/2,1.1*Math.sin(r)))}d.end()}for(let e of d.lines)u.line(e,e.length/3,r.blueMid,1,{alpha:.85});let m=new Q,h=l.y-2.1*a,g=l.x+.08*a;for(let e=h;e>s;e-=.5*a)m.ellipse([g,e,0],[.82*a,0,0],[0,0,.95*a],20,-.8*Math.PI,.8*Math.PI);for(let e of[1,-1])m.p(g,h,e*.95*a).p(g,s,e*.95*a).end();for(let e of m.lines)u.line(e,e.length/3,r.blueDim,.9,{alpha:.85});for(let e of[1,-1])u.line(new Float32Array([g+e*.82*a,l.y,0,g+e*.82*a,s,0]),2,r.blueMid,1,{alpha:c});let _=new Q,v={x:e.tract.P(1.6,0).x,y:e.tract.P(0,2.9).y+.6*n.larynx*a};for(let e of[-.16,.16]){for(let t=0;t<=20;t++){let n=-1+t/10;_.p(v.x+(.35-.65*n*n)*a,v.y+e*a,1.15*n*a)}_.end();for(let t of[1,-1])_.p(v.x-.3*a,v.y+e*a,t*1.15*a).p(v.x-2.8*a,v.y+(.7+e)*a,t*2.05*a).end()}for(let e of _.lines)u.line(e,e.length/3,r.blueMid,1,{alpha:.85});let y=i?.t.glottalArea,b=0;if(y&&y.length){this.strobe=(this.strobe+o/1.8)%1;let e=.02;for(let t=0;t<y.length;t++)e=Math.max(e,y[t]);b=Math.min(.45*a,y[Math.floor(this.strobe*y.length)%y.length]/(1.3*a)*2.2),Number.isFinite(b)||(b=0)}let x=new Q;for(let e of[1,-1])x.p(...f(.72,.1,0)).p(...f(-.55,.1,e*(.06+b/a))).end(),x.p(...f(.72,0,0)).p(...f(-.6,0,e*.62)).end(),x.p(...f(.65,.45,0)).p(...f(-.5,.45,e*.45)).end(),x.ellipse(f(-.72,.15,e*(.3+b/a)),[.18*a,0,0],[0,.12*a,.12*a],10);x.lines.forEach((e,t)=>u.line(e,e.length/3,t%4==0?r.white:r.blueMid,t%4==0?1.3:1,{alpha:t%4==2?.6:.9,hot:t%4==0}))}};function ot(e,t,n,r){let i=e-n.x,a=t-n.y,o=Math.cos(r),s=Math.sin(r);return[n.x+i*o-a*s,n.y+i*s+a*o]}var st=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],ct=e=>{let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]},$=(e,t)=>[e[0]*t,e[1]*t,e[2]*t];function lt(e,t,n){let r=0,i=1/0;for(let e=0;e<t.length;e++){let a=Math.abs(t[e]-n);a<i&&(i=a,r=e)}return e[r]??0}export{at as Anatomy3D};
//# sourceMappingURL=anatomy3d-DvjO7bVG.js.map