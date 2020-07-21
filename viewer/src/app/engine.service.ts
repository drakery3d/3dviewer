import {Injectable, ElementRef, NgZone, OnDestroy} from '@angular/core';
import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import {SSAOPass} from 'three/examples/jsm/postprocessing/SSAOPass';

import {OrbitControls} from './controls';
import {SceneService} from './scene.service';

@Injectable()
export class EngineService implements OnDestroy {
  controls: OrbitControls;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  bloomPass: UnrealBloomPass;
  ssaoPass: SSAOPass;

  private canvas: HTMLCanvasElement;
  private composer: EffectComposer;
  private frameId: number;
  private enablePostProcessing = true;
  private renderTarget: THREE.WebGLMultisampleRenderTarget;
  private renderPass: RenderPass;

  private update = true;

  constructor(private sceneService: SceneService, private ngZone: NgZone) {}

  ngOnDestroy() {
    if (this.frameId != null) cancelAnimationFrame(this.frameId);
  }

  createScene(canvas: ElementRef<HTMLCanvasElement>) {
    window.addEventListener('resize', () => this.resize());

    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas = canvas.nativeElement;

    this.renderer = new THREE.WebGLRenderer({canvas: this.canvas, antialias: true});
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    // this.renderer.toneMapping = THREE.ReinhardToneMapping;
    // this.renderer.toneMappingExposure = 2.2;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.sceneService.scene = new THREE.Scene();
    this.sceneService.scene.background = new THREE.Color(0xffffff);
    this.camera = new THREE.PerspectiveCamera(
      30,
      this.canvas.offsetWidth / this.canvas.offsetHeight,
      0.1,
      1000,
    );
    this.sceneService.scene.add(this.camera);

    // TODO smooth zoom
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => {
      this.update = true;
    });
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.rotateSpeed = 1.5;
    this.controls.panSpeed = 1.5;
    this.controls.zoomSpeed = 3;

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    /**
     * TODO don't use multisampling on low-end devices, because of performane
     * https://youtu.be/pFKalA-fd34
     */
    this.renderTarget = new THREE.WebGLMultisampleRenderTarget(size.width, size.height, {
      format: THREE.RGBFormat,
      stencilBuffer: false,
    });
    this.composer = new EffectComposer(this.renderer, this.renderTarget);
    this.renderPass = new RenderPass(this.sceneService.scene, this.camera);
    this.ssaoPass = new SSAOPass(this.sceneService.scene, this.camera, width, height);
    this.ssaoPass.kernelRadius = 16;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.1, 0.4, 0.85);
    this.composer.addPass(this.renderPass);
  }

  setPostProcessing(enabled: boolean) {
    if (this.enablePostProcessing === enabled) return;
    this.enablePostProcessing = enabled;
    if (enabled) {
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.ssaoPass);
      this.composer.addPass(this.bloomPass);
    } else {
      this.composer.passes = [this.renderPass];
    }
    console.log(enabled ? 'enabled' : 'disabled', 'post processing');
  }

  setBackground(color: THREE.Color) {
    this.sceneService.scene.background = color;
  }

  setUpdate() {
    this.update = true;
  }

  focusObject(object: THREE.Object3D, maintainAngle = false) {
    this.ngZone.runOutsideAngular(() => {
      const box = new THREE.Box3();
      box.expandByObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const maxSize = Math.max(size.x, size.y, size.z);
      const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * this.camera.fov) / 360));
      const fitWidthDistance = fitHeightDistance / this.camera.aspect;
      const distance = Math.max(fitHeightDistance, fitWidthDistance);

      const direction = new THREE.Vector3(0, 0, -1)
        .clone()
        .sub(maintainAngle ? this.camera.position : new THREE.Vector3())
        .normalize()
        .multiplyScalar(distance);

      this.controls.maxDistance = distance * 10;
      this.controls.target.copy(center);

      this.camera.near = distance / 100;
      this.camera.far = distance * 100;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.controls.target).sub(direction);

      this.controls.update();
    });
  }

  animate() {
    this.ngZone.runOutsideAngular(() => {
      this.frameId = requestAnimationFrame(() => this.animate());

      this.controls.update(); // for control.damping

      if (this.update) {
        this.composer.render();
        this.update = false;
      }
    });
  }

  private resize() {
    this.ngZone.runOutsideAngular(() => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      if (this.enablePostProcessing) {
        this.bloomPass.setSize(width, height);
        this.ssaoPass.setSize(width, height);
      }
      this.renderer.setSize(width, height);
      this.composer.setSize(width, height);

      this.update = true;
    });
  }
}
