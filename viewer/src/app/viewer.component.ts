import {
  Component,
  ViewChild,
  ElementRef,
  NgZone,
  OnDestroy,
  AfterViewInit,
} from '@angular/core';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// import { OrbitControls } from './OrbitControlsModified';
import { OrbitControls } from './controls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
// import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass';
// import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass';
// import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader';
// import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader';
// import { EffectPass } from 'postprocessing';

@Component({
  selector: 'app-viewer',
  template: `
    <div class="engine-wrapper">
      <canvas #rendererCanvas id="renderCanvas"></canvas>
    </div>
  `,
  styles: [
    `
      canvas {
        cursor: grab;
      }
    `,
  ],
})
export class ViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('rendererCanvas', { static: false })
  renderCanvas: ElementRef<HTMLCanvasElement>;

  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private controls: any;
  private composer: EffectComposer;
  private fxaaPass: ShaderPass;

  private frameId: number = null;

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit() {
    this.createScene(this.renderCanvas);
    this.createTestScene();

    this.ngZone.runOutsideAngular(() => {
      this.render();
      window.addEventListener('resize', () => this.resize());
    });
  }

  ngOnDestroy(): void {
    if (this.frameId != null) {
      cancelAnimationFrame(this.frameId);
    }
  }

  createScene(canvas: ElementRef<HTMLCanvasElement>): void {
    this.canvas = canvas.nativeElement;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 2.2;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0xffffff, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.scene.add(this.camera);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.rotateSpeed = 1.5;
    this.controls.zoomSpeed = 2;

    this.composer = new EffectComposer(this.renderer);
    var renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    /* const saoPass = new SAOPass(this.scene, this.camera, false, true);
    saoPass.params.saoBias = 1;
    saoPass.params.saoIntensity = 0.1;
    saoPass.params.saoScale = 20;
    saoPass.params.saoKernelRadius = 20;
    this.composer.addPass(saoPass); */
    /* const ssaoPass = new SSAOPass(
      this.scene,
      this.camera,
      window.innerWidth,
      window.innerHeight
    );
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.01;
    ssaoPass.maxDistance = 1;
    this.composer.addPass(ssaoPass); */

    this.fxaaPass = new ShaderPass(FXAAShader);
    var pixelRatio = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms['resolution'].value.x =
      1 / (this.canvas.offsetWidth * pixelRatio);
    this.fxaaPass.material.uniforms['resolution'].value.y =
      1 / (this.canvas.offsetHeight * pixelRatio);
    this.composer.addPass(this.fxaaPass);
  }

  private createTestScene() {
    new GLTFLoader().load('assets/scene.gltf', (result) => {
      const model = result.scene.children[0];
      model.scale.set(10, 10, 10);
      model.traverse((obj) => {
        if ((obj as any).isMesh) {
          (obj as any).material.clearcoat = 1;

          obj.castShadow = true;
          obj.receiveShadow = true;
          if ((obj as any).material.map) {
            (obj as any).material.map.anisotropy = 16;
          }
        }
      });

      this.scene.add(model);
      var bb = new THREE.Box3();
      bb.setFromObject(model);
      bb.getCenter(this.controls.target);
      this.camera.position.y = 10;
      this.camera.position.z = 20;
    });

    const light = new THREE.DirectionalLight(0xdfebff, 5);
    light.shadow.bias = -0.0001;
    light.position.set(300, 400, 50);
    light.castShadow = true;
    light.shadow.radius = 1;
    light.shadow.mapSize.width = 2 ** 12; // 4k
    light.shadow.mapSize.height = 2 ** 12; // 4k
    const d = 200;
    light.shadow.camera.left = -d;
    light.shadow.camera.right = d;
    light.shadow.camera.top = d;
    light.shadow.camera.bottom = -d;
    light.shadow.camera.far = 1000;
    this.scene.add(light);

    var groundMaterial = new THREE.ShadowMaterial({
      color: 0xffffff,
    });
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      groundMaterial
    );
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    this.scene.add(plane);

    this.scene.add(new THREE.AmbientLight(0x666666, 1.5));
  }

  render(): void {
    this.frameId = requestAnimationFrame(() => this.render());
    this.composer.render();
  }

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);

    var pixelRatio = this.renderer.getPixelRatio();

    this.fxaaPass.material.uniforms['resolution'].value.x =
      1 / (this.canvas.offsetWidth * pixelRatio);
    this.fxaaPass.material.uniforms['resolution'].value.y =
      1 / (this.canvas.offsetHeight * pixelRatio);
  }
}